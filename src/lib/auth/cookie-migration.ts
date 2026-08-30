// ===== LEGACY COOKIE MIGRATION (grok -> helion): pure helpers =======================
// SAFE TO DELETE this file together with `./legacy-cookie-migration.server.ts` and its
// `legacyCookieMigration()` plugin entry in `./server.ts`, plus the matching test file
// `./cookie-migration.test.ts` and its line in package.json's `test` script, once
// existing sessions have cycled onto the `__Host-helion-auth.*` cookies.
//
// These are the DEPENDENCY-FREE parts of the shim (no Better Auth, no I/O), so they
// stay unit-testable over a plain Cookie-header string. The plugin wiring that reads
// the request / writes the response lives in `./legacy-cookie-migration.server.ts`.
//
// WHY: a prior build shipped the session cookies as `__Host-grok-auth.*`. Debranding
// renames them to `__Host-helion-auth.*`. Better Auth reads a cookie by one configured
// name and cannot read-old/write-new, so a plain rename would sign existing visitors
// out. `migrateLegacyCookieHeader` copies a surviving legacy cookie under the modern
// name on the inbound request so Better Auth resolves the session; `expireLegacyCookie`
// builds the `Set-Cookie` that drops the legacy cookie afterwards.

/** Legacy `__Host-grok-auth.*` name -> modern `__Host-helion-auth.*` name. Only the two
 * cookies Better Auth reads to resolve a session need carrying over. */
export const LEGACY_COOKIE_MAP: ReadonlyArray<{ legacy: string; modern: string }> = [
  {
    legacy: "__Host-grok-auth.session_token",
    modern: "__Host-helion-auth.session_token",
  },
  {
    legacy: "__Host-grok-auth.session_data",
    modern: "__Host-helion-auth.session_data",
  },
];

/** Every legacy cookie name to expire on the response once carried over. */
export const LEGACY_COOKIE_NAMES: readonly string[] = [
  "__Host-grok-auth.session_token",
  "__Host-grok-auth.session_data",
  "__Host-grok-auth.account_data",
  "__Host-grok-auth.dont_remember",
];

/** Parse a `Cookie` request header into ordered name/value pairs. */
function parseCookieHeader(header: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out.push({
      name: trimmed.slice(0, eq).trim(),
      value: trimmed.slice(eq + 1),
    });
  }
  return out;
}

export type MigrationResult = {
  /** Whether the Cookie header was rewritten (a legacy session was carried over). */
  changed: boolean;
  /** The (possibly rewritten) Cookie header value. */
  cookieHeader: string;
};

/**
 * Pure header rewrite (no I/O). If the modern session_token is absent but the legacy
 * one is present, copy each legacy value under its modern name so Better Auth resolves
 * the session. Never clobbers a live `__Host-helion-auth` session. Deterministic and
 * unit-testable over a plain string (no DB, no network, no Better Auth instance).
 */
export function migrateLegacyCookieHeader(cookieHeader: string | null): MigrationResult {
  const original = cookieHeader ?? "";
  if (!original) return { changed: false, cookieHeader: original };

  const pairs = parseCookieHeader(original);
  const has = (name: string): boolean => pairs.some((p) => p.name === name);
  const valueOf = (name: string): string | undefined => pairs.find((p) => p.name === name)?.value;

  // Only migrate when the modern session token is missing (never clobber a live
  // helion session) and a legacy session token is actually present.
  const sessionPair = LEGACY_COOKIE_MAP[0];
  if (has(sessionPair.modern) || !has(sessionPair.legacy)) {
    return { changed: false, cookieHeader: original };
  }

  const added: string[] = [];
  for (const { legacy, modern } of LEGACY_COOKIE_MAP) {
    if (has(modern)) continue;
    const legacyValue = valueOf(legacy);
    if (legacyValue === undefined) continue;
    added.push(`${modern}=${legacyValue}`);
  }
  if (added.length === 0) return { changed: false, cookieHeader: original };

  return { changed: true, cookieHeader: `${original}; ${added.join("; ")}` };
}

/** Build the `Set-Cookie` value that expires a legacy `__Host-` cookie. `__Host-`
 * requires Secure + Path=/ + no Domain, matched here so the browser accepts it. */
export function expireLegacyCookie(name: string): string {
  return `${name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}
// ===== END LEGACY COOKIE MIGRATION (pure helpers) ===================================
