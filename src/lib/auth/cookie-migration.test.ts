import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expireLegacyCookie,
  LEGACY_COOKIE_NAMES,
  migrateLegacyCookieHeader,
} from "./cookie-migration.ts";

// Pure, dependency-free tests for the LEGACY COOKIE MIGRATION (grok -> helion) shim.
// No DB, no network, no running Better Auth instance: just the header-rewrite helper
// operating on a plain Cookie string. Delete alongside the shim once sessions cycle.

const LEGACY_TOKEN = "__Host-grok-auth.session_token";
const MODERN_TOKEN = "__Host-helion-auth.session_token";
const LEGACY_DATA = "__Host-grok-auth.session_data";
const MODERN_DATA = "__Host-helion-auth.session_data";

describe("migrateLegacyCookieHeader", () => {
  it("carries a legacy session_token over under the modern name", () => {
    const result = migrateLegacyCookieHeader(`${LEGACY_TOKEN}=abc123`);
    assert.equal(result.changed, true);
    assert.match(result.cookieHeader, new RegExp(`${MODERN_TOKEN}=abc123`));
    // The original legacy cookie is preserved in the header (the response expires it).
    assert.match(result.cookieHeader, new RegExp(`${LEGACY_TOKEN}=abc123`));
  });

  it("also carries session_data over when present", () => {
    const result = migrateLegacyCookieHeader(`${LEGACY_TOKEN}=tok; ${LEGACY_DATA}=cache`);
    assert.equal(result.changed, true);
    assert.match(result.cookieHeader, new RegExp(`${MODERN_TOKEN}=tok`));
    assert.match(result.cookieHeader, new RegExp(`${MODERN_DATA}=cache`));
  });

  it("does nothing when the modern session_token is already present", () => {
    const header = `${MODERN_TOKEN}=live; ${LEGACY_TOKEN}=stale`;
    const result = migrateLegacyCookieHeader(header);
    assert.equal(result.changed, false);
    assert.equal(result.cookieHeader, header);
  });

  it("does nothing when there is no legacy session_token", () => {
    const header = "other=1; unrelated=2";
    const result = migrateLegacyCookieHeader(header);
    assert.equal(result.changed, false);
    assert.equal(result.cookieHeader, header);
  });

  it("does nothing for an empty or null header", () => {
    assert.equal(migrateLegacyCookieHeader("").changed, false);
    assert.equal(migrateLegacyCookieHeader(null).changed, false);
  });

  it("preserves cookie values verbatim (signed tokens contain '.' and '%')", () => {
    const signed = "sesh.abc%3D.def";
    const result = migrateLegacyCookieHeader(`${LEGACY_TOKEN}=${signed}`);
    assert.equal(result.changed, true);
    assert.match(result.cookieHeader, new RegExp(`${MODERN_TOKEN}=sesh\\.abc%3D\\.def`));
  });
});

describe("expireLegacyCookie", () => {
  it("emits a __Host--compliant expiry (Secure + Path=/ + no Domain, Max-Age=0)", () => {
    const setCookie = expireLegacyCookie(LEGACY_TOKEN);
    assert.match(setCookie, new RegExp(`^${LEGACY_TOKEN}=;`));
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /Max-Age=0/);
    assert.doesNotMatch(setCookie, /Domain=/);
  });

  it("covers all four legacy cookie names", () => {
    assert.deepEqual([...LEGACY_COOKIE_NAMES].sort(), [
      "__Host-grok-auth.account_data",
      "__Host-grok-auth.dont_remember",
      "__Host-grok-auth.session_data",
      "__Host-grok-auth.session_token",
    ]);
  });
});
