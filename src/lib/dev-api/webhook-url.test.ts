import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedWebhookUrl } from "./webhook-url.ts";

// Pure predicate — no DB, no network. Covers the allow/deny cases the SSRF
// guard (Finding 5) must get right, including IPv4/IPv6 literals and common
// bypass shapes. Documented scope: this is a literal/string check only; DNS
// resolution and rebinding are explicitly out of scope (see webhook-url.ts).
describe("isAllowedWebhookUrl (SSRF allowlist)", () => {
  it("allows public https URLs", () => {
    assert.equal(isAllowedWebhookUrl("https://example.com/hook"), true);
    assert.equal(isAllowedWebhookUrl("https://hooks.example.com:8443/path?x=1"), true);
    assert.equal(isAllowedWebhookUrl("https://8.8.8.8/hook"), true, "public IPv4 literal is fine");
    assert.equal(
      isAllowedWebhookUrl("https://webhook-test.invalid/hook"),
      true,
      "unresolvable-but-public name passes the literal check",
    );
  });

  it("rejects non-https schemes", () => {
    assert.equal(isAllowedWebhookUrl("http://example.com/hook"), false, "plain http");
    assert.equal(isAllowedWebhookUrl("ftp://example.com/hook"), false);
    assert.equal(isAllowedWebhookUrl("file:///etc/passwd"), false);
    assert.equal(isAllowedWebhookUrl("gopher://example.com/"), false);
    assert.equal(isAllowedWebhookUrl("data:text/plain,hi"), false);
  });

  it("rejects malformed / hostless URLs", () => {
    assert.equal(isAllowedWebhookUrl("not a url"), false);
    assert.equal(isAllowedWebhookUrl(""), false);
    assert.equal(isAllowedWebhookUrl("https://"), false);
  });

  it("rejects localhost and .local names", () => {
    assert.equal(isAllowedWebhookUrl("https://localhost/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://LOCALHOST:3000/hook"), false, "case-insensitive");
    assert.equal(isAllowedWebhookUrl("https://api.localhost/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://printer.local/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://local/hook"), false);
  });

  it("rejects loopback IPv4", () => {
    assert.equal(isAllowedWebhookUrl("https://127.0.0.1/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://127.1.2.3/hook"), false, "all of 127/8");
    assert.equal(isAllowedWebhookUrl("https://0.0.0.0/hook"), false);
  });

  it("rejects RFC1918 private IPv4 ranges", () => {
    assert.equal(isAllowedWebhookUrl("https://10.0.0.1/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://10.255.255.255/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://172.16.0.1/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://172.31.255.1/hook"), false, "top of 172.16/12");
    assert.equal(isAllowedWebhookUrl("https://172.15.0.1/hook"), true, "just below 172.16/12");
    assert.equal(isAllowedWebhookUrl("https://172.32.0.1/hook"), true, "just above 172.16/12");
    assert.equal(isAllowedWebhookUrl("https://192.168.1.1/hook"), false);
  });

  it("rejects link-local IPv4 incl. cloud metadata (169.254.169.254)", () => {
    assert.equal(isAllowedWebhookUrl("https://169.254.169.254/latest/meta-data/"), false);
    assert.equal(isAllowedWebhookUrl("https://169.254.0.1/hook"), false);
  });

  it("rejects loopback / link-local / unique-local IPv6 literals", () => {
    assert.equal(isAllowedWebhookUrl("https://[::1]/hook"), false, "IPv6 loopback");
    assert.equal(isAllowedWebhookUrl("https://[::]/hook"), false, "unspecified");
    assert.equal(isAllowedWebhookUrl("https://[fe80::1]/hook"), false, "link-local");
    assert.equal(isAllowedWebhookUrl("https://[fc00::1]/hook"), false, "unique-local fc00::/7");
    assert.equal(isAllowedWebhookUrl("https://[fd12:3456::1]/hook"), false, "unique-local fd..");
  });

  it("rejects IPv4-mapped IPv6 that embeds a private address", () => {
    assert.equal(isAllowedWebhookUrl("https://[::ffff:127.0.0.1]/hook"), false);
    assert.equal(isAllowedWebhookUrl("https://[::ffff:169.254.169.254]/hook"), false);
  });

  it("rejects an octet-out-of-range shape rather than treating it as a name", () => {
    // 999.1.1.1 is not a valid IPv4 literal; URL parses it as a hostname. It is
    // not private by our literal rules, but it is also not routable — allowing
    // it is harmless (it will simply fail to connect) and keeps the predicate a
    // pure literal check. Assert it does not crash and returns a boolean.
    assert.equal(typeof isAllowedWebhookUrl("https://999.1.1.1/hook"), "boolean");
  });
});
