import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_PROVIDERS } from "./providers.ts";
import { emailAndPasswordEnabled } from "./email-password.ts";
import {
  isAuthConfigured,
  isAuthDisabled,
  isGithubConfigured,
  isGoogleConfigured,
} from "./config.ts";

// These test the PURE, dependency-free auth wiring logic (no browser, no
// server-only Better Auth instance / pg / Kysely dialect). The detection
// functions accept an explicit env source so we never mutate process.env.

describe("social providers list", () => {
  it("is a client-safe list shaped { id, label }", () => {
    assert.ok(Array.isArray(SOCIAL_PROVIDERS));
    assert.ok(SOCIAL_PROVIDERS.length >= 1);
    for (const p of SOCIAL_PROVIDERS) {
      assert.equal(typeof p.id, "string");
      assert.equal(typeof p.label, "string");
      assert.ok(p.id.length > 0 && p.label.length > 0);
    }
  });

  it("offers Google and is shaped for one-line extension", () => {
    const google = SOCIAL_PROVIDERS.find((p) => p.id === "google");
    assert.ok(google, "google must be in the social providers list");
    assert.equal(google.label, "Google");
    // Shape check: { id, label } is the whole contract, so adding a provider is
    // a one-line change.
    assert.deepEqual(Object.keys(google).sort(), ["id", "label"]);
  });

  it("offers GitHub", () => {
    const github = SOCIAL_PROVIDERS.find((p) => p.id === "github");
    assert.ok(github, "github must be in the social providers list");
    assert.equal(github.label, "GitHub");
    assert.deepEqual(Object.keys(github).sort(), ["id", "label"]);
  });
});

describe("email/password", () => {
  it("is enabled", () => {
    assert.equal(emailAndPasswordEnabled, true);
  });
});

describe("isGoogleConfigured", () => {
  it("is false when neither credential is set", () => {
    assert.equal(isGoogleConfigured({}), false);
  });

  it("is false when only one credential is set", () => {
    assert.equal(isGoogleConfigured({ GOOGLE_CLIENT_ID: "id-only" }), false);
    assert.equal(
      isGoogleConfigured({ GOOGLE_CLIENT_SECRET: "secret-only" }),
      false,
    );
  });

  it("is true only when BOTH credentials are present", () => {
    assert.equal(
      isGoogleConfigured({
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      }),
      true,
    );
  });

  it("treats whitespace-only credentials as unset", () => {
    assert.equal(
      isGoogleConfigured({
        GOOGLE_CLIENT_ID: "   ",
        GOOGLE_CLIENT_SECRET: "   ",
      }),
      false,
    );
  });

  it("does not depend on any GROK_AUTH_* broker credentials", () => {
    // Broker creds must have NO effect on Google availability.
    assert.equal(
      isGoogleConfigured({
        GROK_AUTH_CLIENT_ID: "x",
        GROK_AUTH_CLIENT_SECRET: "y",
        GROK_AUTH_ISSUER: "https://broker.example",
      }),
      false,
    );
  });
});

describe("isGithubConfigured", () => {
  it("is false when neither credential is set", () => {
    assert.equal(isGithubConfigured({}), false);
  });

  it("is false when only one credential is set", () => {
    assert.equal(isGithubConfigured({ GITHUB_CLIENT_ID: "id-only" }), false);
    assert.equal(
      isGithubConfigured({ GITHUB_CLIENT_SECRET: "secret-only" }),
      false,
    );
  });

  it("is true only when BOTH credentials are present", () => {
    assert.equal(
      isGithubConfigured({
        GITHUB_CLIENT_ID: "id",
        GITHUB_CLIENT_SECRET: "secret",
      }),
      true,
    );
  });

  it("treats whitespace-only credentials as unset", () => {
    assert.equal(
      isGithubConfigured({
        GITHUB_CLIENT_ID: "   ",
        GITHUB_CLIENT_SECRET: "   ",
      }),
      false,
    );
  });

  it("does not depend on any GROK_AUTH_* broker credentials", () => {
    // Broker creds must have NO effect on GitHub availability.
    assert.equal(
      isGithubConfigured({
        GROK_AUTH_CLIENT_ID: "x",
        GROK_AUTH_CLIENT_SECRET: "y",
        GROK_AUTH_ISSUER: "https://broker.example",
      }),
      false,
    );
  });
});

describe("isAuthConfigured (real auth available)", () => {
  it("is true when email/password is on, even with no Google and no broker", () => {
    assert.equal(isAuthConfigured({}, true), true);
  });

  it("is true when Google is configured even if email/password is off", () => {
    assert.equal(
      isAuthConfigured(
        { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" },
        false,
      ),
      true,
    );
  });

  it("is true when only GitHub is configured (email/password off, no Google)", () => {
    assert.equal(
      isAuthConfigured(
        { GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" },
        false,
      ),
      true,
    );
  });

  it("is false when auth is force-disabled, regardless of methods", () => {
    assert.equal(
      isAuthConfigured({ VITE_AUTH_ENABLED: "false" }, true),
      false,
    );
    assert.equal(isAuthDisabled({ VITE_AUTH_ENABLED: "false" }), true);
  });

  it("is false when nothing is enabled (email/password off, no Google)", () => {
    assert.equal(isAuthConfigured({}, false), false);
  });

  it("does NOT require GROK_AUTH_* to be configured", () => {
    // With email/password on and zero broker creds, real auth is available.
    assert.equal(
      isAuthConfigured(
        { GROK_AUTH_CLIENT_ID: "x", GROK_AUTH_CLIENT_SECRET: "y" },
        true,
      ),
      true,
    );
  });
});
