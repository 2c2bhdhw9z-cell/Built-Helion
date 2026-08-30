import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  userPreferencesSchema,
  type UserPreferences,
} from "./types.ts";

// Same loader hook as feedback.test.ts: it resolves the `@/` alias and inlines
// the REAL migration SQL (including migrations/0003_preferences.sql) so this
// suite hits a genuine PGLite database — no DB mocking, no seeded rows.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type SettingsServer = {
  getPreferences: (userId: string) => Promise<UserPreferences>;
  upsertPreferences: (
    userId: string,
    prefs: UserPreferences,
  ) => Promise<UserPreferences>;
};

describe("userPreferences model", () => {
  it("DEFAULT_PREFERENCES has autofill OFF", () => {
    assert.equal(DEFAULT_PREFERENCES.autofillFeedbackEmail, false);
  });

  it("normalizePreferences fills missing fields with the default", () => {
    assert.deepEqual(normalizePreferences({}), DEFAULT_PREFERENCES);
    assert.deepEqual(normalizePreferences(null), DEFAULT_PREFERENCES);
    assert.deepEqual(normalizePreferences("garbage"), DEFAULT_PREFERENCES);
  });

  it("normalizePreferences keeps a valid provided value", () => {
    assert.deepEqual(normalizePreferences({ autofillFeedbackEmail: true }), {
      autofillFeedbackEmail: true,
    });
  });

  it("schema coerces a partial object to a complete one", () => {
    assert.deepEqual(userPreferencesSchema.parse({}), DEFAULT_PREFERENCES);
  });
});

describe("preferences DB round trip (real PGLite, migration 0003)", () => {
  let server: SettingsServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as SettingsServer;
  });

  it("returns the default for an unknown user (no row)", async () => {
    const prefs = await server.getPreferences("unknown-user-id");
    assert.deepEqual(prefs, { autofillFeedbackEmail: false });
  });

  it("upsertPreferences then getPreferences returns the stored value", async () => {
    const userId = "user-round-trip";
    const saved = await server.upsertPreferences(userId, {
      autofillFeedbackEmail: true,
    });
    assert.equal(saved.autofillFeedbackEmail, true);

    const loaded = await server.getPreferences(userId);
    assert.equal(loaded.autofillFeedbackEmail, true);
  });

  it("upsertPreferences updates an existing row (idempotent on user_id)", async () => {
    const userId = "user-update";
    await server.upsertPreferences(userId, { autofillFeedbackEmail: true });
    const off = await server.upsertPreferences(userId, {
      autofillFeedbackEmail: false,
    });
    assert.equal(off.autofillFeedbackEmail, false);

    const loaded = await server.getPreferences(userId);
    assert.equal(loaded.autofillFeedbackEmail, false, "the update persisted");
  });

  it("scopes preferences per user id", async () => {
    await server.upsertPreferences("user-a", { autofillFeedbackEmail: true });
    await server.upsertPreferences("user-b", { autofillFeedbackEmail: false });
    assert.equal((await server.getPreferences("user-a")).autofillFeedbackEmail, true);
    assert.equal((await server.getPreferences("user-b")).autofillFeedbackEmail, false);
  });
});
