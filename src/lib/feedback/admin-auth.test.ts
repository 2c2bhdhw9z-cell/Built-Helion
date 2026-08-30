import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAuthorizedAdmin,
  parseAdminEmails,
  type AdminAuthInputs,
} from "./admin-auth.server.ts";

// These test the PURE, dependency-free admin-auth decision logic. Neither
// `parseAdminEmails` nor `isAuthorizedAdmin` reads the environment or performs
// I/O (the session/token/DB facts are passed in explicitly), so they import
// cleanly under `node --experimental-strip-types` — the module only imports
// `node:crypto` at the top level and dynamically imports verify.server ONLY
// inside `assertAdmin`, which we do not exercise here.

describe("parseAdminEmails", () => {
  it("returns [] for undefined / empty / blank input", () => {
    assert.deepEqual(parseAdminEmails(undefined), []);
    assert.deepEqual(parseAdminEmails(""), []);
    assert.deepEqual(parseAdminEmails("   "), []);
    assert.deepEqual(parseAdminEmails(",, ,"), []);
  });

  it("splits on commas", () => {
    assert.deepEqual(parseAdminEmails("a@x.com,b@x.com"), [
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("trims surrounding whitespace on each entry", () => {
    assert.deepEqual(parseAdminEmails("  a@x.com , b@x.com  "), [
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("lower-cases each entry", () => {
    assert.deepEqual(parseAdminEmails("Brett.Cauthan@Gmail.COM"), [
      "brett.cauthan@gmail.com",
    ]);
  });

  it("drops blank entries produced by stray commas", () => {
    assert.deepEqual(parseAdminEmails("a@x.com,,, ,b@x.com,"), [
      "a@x.com",
      "b@x.com",
    ]);
  });
});

/** Config: token mechanism only. */
const TOKEN_CONFIG = {
  hasDatabase: true,
  adminToken: "s3cret-token",
  emails: [] as string[],
};

/** Config: email allowlist only (with a real database, i.e. a real deploy). */
const EMAIL_CONFIG = {
  hasDatabase: true,
  adminToken: undefined,
  emails: ["brettcauthan@gmail.com"],
};

describe("isAuthorizedAdmin — token mechanism", () => {
  it("authorizes an exactly matching token", () => {
    assert.equal(
      isAuthorizedAdmin({ token: "s3cret-token" }, TOKEN_CONFIG),
      true,
    );
  });

  it("rejects a wrong token", () => {
    assert.equal(isAuthorizedAdmin({ token: "nope" }, TOKEN_CONFIG), false);
  });

  it("rejects a missing token when a token is configured", () => {
    assert.equal(isAuthorizedAdmin({}, TOKEN_CONFIG), false);
    assert.equal(
      isAuthorizedAdmin({ token: null }, TOKEN_CONFIG),
      false,
    );
  });
});

describe("isAuthorizedAdmin — verified email allowlist mechanism", () => {
  it("authorizes a verified allowlisted email", () => {
    const inputs: AdminAuthInputs = {
      sessionEmail: "brettcauthan@gmail.com",
      sessionEmailVerified: true,
    };
    assert.equal(isAuthorizedAdmin(inputs, EMAIL_CONFIG), true);
  });

  it("does NOT authorize an allowlisted email that is unverified", () => {
    const inputs: AdminAuthInputs = {
      sessionEmail: "brettcauthan@gmail.com",
      sessionEmailVerified: false,
    };
    assert.equal(isAuthorizedAdmin(inputs, EMAIL_CONFIG), false);
  });

  it("does NOT authorize when the verified flag is absent (defaults to unverified)", () => {
    const inputs: AdminAuthInputs = {
      sessionEmail: "brettcauthan@gmail.com",
    };
    assert.equal(isAuthorizedAdmin(inputs, EMAIL_CONFIG), false);
  });

  it("does NOT authorize an email that is not on the allowlist", () => {
    const inputs: AdminAuthInputs = {
      sessionEmail: "someone-else@gmail.com",
      sessionEmailVerified: true,
    };
    assert.equal(isAuthorizedAdmin(inputs, EMAIL_CONFIG), false);
  });

  it("matches the allowlist case-insensitively", () => {
    const inputs: AdminAuthInputs = {
      sessionEmail: "BrettCauthan@Gmail.COM",
      sessionEmailVerified: true,
    };
    assert.equal(isAuthorizedAdmin(inputs, EMAIL_CONFIG), true);
  });

  it("does NOT authorize a null / empty session email", () => {
    assert.equal(
      isAuthorizedAdmin(
        { sessionEmail: null, sessionEmailVerified: true },
        EMAIL_CONFIG,
      ),
      false,
    );
    assert.equal(
      isAuthorizedAdmin(
        { sessionEmail: "  ", sessionEmailVerified: true },
        EMAIL_CONFIG,
      ),
      false,
    );
  });

  it("authorizes nobody via email when the allowlist is empty/unset", () => {
    const emptyEmailConfig = {
      hasDatabase: true,
      adminToken: "s3cret-token",
      emails: [] as string[],
    };
    assert.equal(
      isAuthorizedAdmin(
        { sessionEmail: "brettcauthan@gmail.com", sessionEmailVerified: true },
        emptyEmailConfig,
      ),
      false,
    );
  });
});

describe("isAuthorizedAdmin — no-mechanism fallback", () => {
  const NO_MECHANISM = {
    adminToken: undefined,
    emails: [] as string[],
  };

  it("allows on the local no-database dev/test path", () => {
    assert.equal(
      isAuthorizedAdmin({}, { ...NO_MECHANISM, hasDatabase: false }),
      true,
    );
  });

  it("denies when a real database is attached (fail closed)", () => {
    assert.equal(
      isAuthorizedAdmin({}, { ...NO_MECHANISM, hasDatabase: true }),
      false,
    );
  });
});
