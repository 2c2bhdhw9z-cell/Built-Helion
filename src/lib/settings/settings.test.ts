import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  PREFERENCES_STORAGE_KEY,
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
  it("DEFAULT_PREFERENCES has autofill OFF and theme dark", () => {
    assert.equal(DEFAULT_PREFERENCES.autofillFeedbackEmail, false);
    assert.equal(DEFAULT_PREFERENCES.theme, "dark");
  });

  it("normalizePreferences fills missing fields with the default", () => {
    assert.deepEqual(normalizePreferences({}), DEFAULT_PREFERENCES);
    assert.deepEqual(normalizePreferences(null), DEFAULT_PREFERENCES);
    assert.deepEqual(normalizePreferences("garbage"), DEFAULT_PREFERENCES);
  });

  it("normalizePreferences keeps a valid provided value", () => {
    assert.deepEqual(normalizePreferences({ autofillFeedbackEmail: true }), {
      autofillFeedbackEmail: true,
      theme: "dark",
    });
  });

  it("normalizePreferences keeps a light theme", () => {
    assert.deepEqual(normalizePreferences({ theme: "light" }), {
      autofillFeedbackEmail: false,
      theme: "light",
    });
  });

  it("schema coerces a partial object to a complete one", () => {
    assert.deepEqual(userPreferencesSchema.parse({}), DEFAULT_PREFERENCES);
  });
});

// The logged-out preference path serializes to localStorage with JSON.stringify
// and reads back via `normalizePreferences(JSON.parse(...))` (see
// readLocalPreferences/writeLocalPreferences in use-preferences.ts). That module
// pulls in React + @tanstack/react-start, which the node:test strip-types loader
// cannot resolve, so we assert the exact serialize/normalize round-trip it
// performs. This pins the "toggle ON survives a reload" semantics for a
// signed-out visitor and the never-throw fallback on corrupt storage, the
// logged-out analogue of the signed-in persistence the fix must keep intact.
describe("local preference store round-trip (serialize + normalize)", () => {
  it("round-trips a toggled-ON value", () => {
    const toggledOn: UserPreferences = { autofillFeedbackEmail: true, theme: "dark" };
    const stored = JSON.stringify(toggledOn);
    assert.deepEqual(normalizePreferences(JSON.parse(stored)), toggledOn);
  });

  it("round-trips a toggled-OFF value", () => {
    const toggledOff: UserPreferences = { autofillFeedbackEmail: false, theme: "dark" };
    const stored = JSON.stringify(toggledOff);
    assert.deepEqual(normalizePreferences(JSON.parse(stored)), toggledOff);
  });

  it("round-trips light theme", () => {
    const light: UserPreferences = { autofillFeedbackEmail: false, theme: "light" };
    const stored = JSON.stringify(light);
    assert.deepEqual(normalizePreferences(JSON.parse(stored)), light);
  });

  it("uses a stable, documented storage key", () => {
    assert.equal(PREFERENCES_STORAGE_KEY, "helion.preferences");
  });
});

describe("preferences DB round trip (real PGLite, migration 0003 + 0005)", () => {
  let server: SettingsServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as SettingsServer;
  });

  it("returns the default for an unknown user (no row)", async () => {
    const prefs = await server.getPreferences("unknown-user-id");
    assert.deepEqual(prefs, { autofillFeedbackEmail: false, theme: "dark" });
  });

  it("upsertPreferences then getPreferences returns the stored value", async () => {
    const userId = "user-round-trip";
    const saved = await server.upsertPreferences(userId, {
      autofillFeedbackEmail: true,
      theme: "dark",
    });
    assert.equal(saved.autofillFeedbackEmail, true);

    const loaded = await server.getPreferences(userId);
    assert.equal(loaded.autofillFeedbackEmail, true);
  });

  it("round-trips a STRICT boolean true (not a truthy 't'/1 string)", async () => {
    // Guards the snake_case column (autofill_feedback_email) <-> camelCase field
    // (autofillFeedbackEmail) mapping AND the boolean parse across pg/PGLite: the
    // value the client persisted must come back as a real JS `true`, so the
    // client's `updatePreferencesFn` result (and the reload's getPreferences)
    // renders the switch ON. A truthy string like 't' would pass `Boolean(...)`
    // here but is exactly the class of bug this asserts against.
    const userId = "user-strict-boolean";
    const saved = await server.upsertPreferences(userId, {
      autofillFeedbackEmail: true,
      theme: "dark",
    });
    assert.strictEqual(saved.autofillFeedbackEmail, true);
    assert.strictEqual(typeof saved.autofillFeedbackEmail, "boolean");

    const loaded = await server.getPreferences(userId);
    assert.strictEqual(loaded.autofillFeedbackEmail, true);
    assert.strictEqual(typeof loaded.autofillFeedbackEmail, "boolean");
  });

  it("upsertPreferences updates an existing row (idempotent on user_id)", async () => {
    const userId = "user-update";
    await server.upsertPreferences(userId, { autofillFeedbackEmail: true, theme: "dark" });
    const off = await server.upsertPreferences(userId, {
      autofillFeedbackEmail: false,
      theme: "light",
    });
    assert.equal(off.autofillFeedbackEmail, false);
    assert.equal(off.theme, "light");

    const loaded = await server.getPreferences(userId);
    assert.equal(loaded.autofillFeedbackEmail, false, "the update persisted");
    assert.equal(loaded.theme, "light");
  });

  it("scopes preferences per user id", async () => {
    await server.upsertPreferences("user-a", { autofillFeedbackEmail: true, theme: "dark" });
    await server.upsertPreferences("user-b", { autofillFeedbackEmail: false, theme: "light" });
    assert.equal((await server.getPreferences("user-a")).autofillFeedbackEmail, true);
    assert.equal((await server.getPreferences("user-b")).autofillFeedbackEmail, false);
    assert.equal((await server.getPreferences("user-b")).theme, "light");
  });
});
