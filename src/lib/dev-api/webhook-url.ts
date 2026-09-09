/**
 * Best-effort application-layer SSRF guard for user-supplied webhook targets
 * (Finding 5). A webhook URL is chosen by the developer and then POSTed to by
 * the server (on real events via `fireWebhooks` and on demand via the "Test"
 * button via `testWebhook`), so an unvalidated URL lets a developer point the
 * server at internal/link-local/loopback addresses (e.g. cloud metadata at
 * `http://169.254.169.254/…`) — a classic SSRF. This helper is the pure,
 * unit-tested predicate both the registration path (`insertWebhook`) and the
 * firing paths defensively enforce.
 *
 * SCOPE (deliberately limited): this is a best-effort STRING/LITERAL check. It
 * validates the scheme and rejects hostnames that are obviously private (IP
 * literals in RFC1918 / loopback / link-local ranges, `localhost`, `.local`,
 * hostless URLs). It does NOT resolve DNS, so a public hostname that resolves
 * to a private IP at request time, and DNS-rebinding attacks, are OUT OF SCOPE
 * — full SSRF hardening (resolve-then-pin, egress firewalling) is an
 * infrastructure concern handled elsewhere. Keeping it pure and literal-only is
 * what makes it cheap, deterministic, and testable.
 */

/** Is this dotted-quad string an IPv4 literal? Returns the 4 octets or null. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [
    number,
    number,
    number,
    number,
  ];
  if (octets.some((o) => o > 255)) return null;
  return octets;
}

/** RFC1918 / loopback / link-local / unspecified IPv4 ranges we refuse. */
function isPrivateIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8 unspecified
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

/** Normalize an IPv6 host: strip surrounding brackets `[…]` and lowercase. */
function normalizeIpv6(host: string): string {
  const inner = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return inner.toLowerCase();
}

/** IPv6 loopback / unspecified / link-local / unique-local ranges we refuse. */
function isPrivateIpv6(host: string): boolean {
  const h = normalizeIpv6(host);
  if (!h.includes(":")) return false; // not an IPv6 literal
  if (h === "::1") return true; // loopback
  if (h === "::") return true; // unspecified
  if (h.startsWith("fe80")) return true; // fe80::/10 link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 unique-local
  // IPv4-mapped addresses. The URL parser may keep the dotted-quad form
  // (`::ffff:127.0.0.1`) or normalize it to hex (`::ffff:7f00:1`); handle both
  // by decoding the embedded IPv4 and reusing the private-IPv4 rules.
  if (h.startsWith("::ffff:")) {
    const tail = h.slice("::ffff:".length);
    const dotted = /^(\d{1,3}\.){3}\d{1,3}$/.exec(tail);
    if (dotted) {
      const v4 = parseIpv4(tail);
      if (v4 && isPrivateIpv4(v4)) return true;
    } else {
      // Hex form: two hextets encode the 32-bit IPv4 (`7f00:1` = 127.0.0.1).
      const hextets = tail.split(":");
      if (hextets.length === 2) {
        const hi = Number.parseInt(hextets[0] || "0", 16);
        const lo = Number.parseInt(hextets[1] || "0", 16);
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          const v4: [number, number, number, number] = [
            (hi >> 8) & 0xff,
            hi & 0xff,
            (lo >> 8) & 0xff,
            lo & 0xff,
          ];
          if (isPrivateIpv4(v4)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * True only for an `https:` URL whose host is a public host. Rejects: non-https
 * schemes (http, file, ftp, gopher, data, …), hostless URLs, `localhost` and
 * any `*.local`/`*.localhost` name, and IPv4/IPv6 literals in private,
 * loopback, link-local, or unique-local ranges. Never throws — a URL that fails
 * to parse returns false.
 */
export function isAllowedWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only https. http/file/ftp/gopher/data/etc. are refused outright.
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname;
  if (!host) return false;

  const lower = host.toLowerCase();
  if (lower === "localhost") return false;
  if (lower.endsWith(".localhost")) return false;
  // `.local` mDNS names resolve on the LAN — treat as private.
  if (lower === "local" || lower.endsWith(".local")) return false;

  const v4 = parseIpv4(lower);
  if (v4) return !isPrivateIpv4(v4);

  if (isPrivateIpv6(host)) return false;

  return true;
}
