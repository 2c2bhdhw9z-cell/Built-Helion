import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { isAuthorizedAdmin } from "./admin-auth.server.ts";
import { allow, resetBuckets } from "./throttle.server.ts";
import { submitFeedbackSchema, updateStatusSchema } from "./types.ts";
import type {
  FeedbackItem,
  FeedbackStatus,
  SubmitFeedbackInput,
} from "./types.ts";

// The DB layer (src/lib/db.ts) loads migrations with Vite's `import.meta.glob`
// and server.ts imports it via the `@/` alias. Neither works under plain
// `node --experimental-strip-types`, so register a loader hook that resolves
// the alias and inlines the REAL migration SQL (see pglite-glob-loader.mjs).
// This exercises the genuine PGLite database — no DB mocking, no seeded rows.
register("./pglite-glob-loader.mjs", import.meta.url);

type FeedbackServer = {
  insertFeedback: (input: SubmitFeedbackInput) => Promise<FeedbackItem>;
  listFeedback: () => Promise<FeedbackItem[]>;
  updateFeedbackStatus: (
    id: string,
    status: FeedbackStatus,
  ) => Promise<FeedbackItem | null>;
};

describe("submitFeedbackSchema", () => {
  it("accepts a full valid submission", () => {
    const parsed = submitFeedbackSchema.parse({
      type: "feature",
      title: "Add dark mode",
      category: "ui",
      description: "A dark theme would be great",
      stepsOrUseCases: "Toggle in settings",
      severityOrPriority: "medium",
      rating: 5,
      userEmail: "user@example.com",
    });
    assert.equal(parsed.type, "feature");
    assert.equal(parsed.title, "Add dark mode");
    assert.equal(parsed.rating, 5);
  });

  it("rejects a missing title", () => {
    assert.throws(() =>
      submitFeedbackSchema.parse({ type: "bug", description: "no title" }),
    );
  });

  it("rejects a missing description", () => {
    assert.throws(() =>
      submitFeedbackSchema.parse({ type: "bug", title: "has title" }),
    );
  });

  it("rejects an empty title/description after trim", () => {
    assert.throws(() =>
      submitFeedbackSchema.parse({
        type: "bug",
        title: "   ",
        description: "   ",
      }),
    );
  });

  it("rejects an invalid type", () => {
    assert.throws(() =>
      submitFeedbackSchema.parse({
        type: "praise",
        title: "t",
        description: "d",
      }),
    );
  });
});

describe("updateStatusSchema", () => {
  it("accepts a valid status", () => {
    const parsed = updateStatusSchema.parse({ id: "abc", status: "planned" });
    assert.equal(parsed.status, "planned");
  });

  it("rejects an invalid status", () => {
    assert.throws(() =>
      updateStatusSchema.parse({ id: "abc", status: "wontfix" }),
    );
  });

  it("rejects a missing id", () => {
    assert.throws(() => updateStatusSchema.parse({ status: "planned" }));
  });
});

describe("admin authorization (isAuthorizedAdmin)", () => {
  it("allows local dev when no database and no mechanism configured", () => {
    assert.equal(
      isAuthorizedAdmin({}, { hasDatabase: false, emails: [] }),
      true,
    );
  });

  it("FAILS CLOSED on a real deploy when no mechanism is configured", () => {
    // DATABASE_URL set (real deploy) but neither token nor allowlist -> deny,
    // so submitter PII is never exposed by default.
    assert.equal(
      isAuthorizedAdmin({}, { hasDatabase: true, emails: [] }),
      false,
    );
  });

  it("authorizes a matching admin token", () => {
    const config = { hasDatabase: true, adminToken: "s3cret", emails: [] };
    assert.equal(isAuthorizedAdmin({ token: "s3cret" }, config), true);
  });

  it("rejects a wrong or missing admin token when a token is configured", () => {
    const config = { hasDatabase: true, adminToken: "s3cret", emails: [] };
    assert.equal(isAuthorizedAdmin({ token: "nope" }, config), false);
    assert.equal(isAuthorizedAdmin({}, config), false);
    // A configured token means we no longer trust the no-database fallback.
    assert.equal(
      isAuthorizedAdmin(
        {},
        { hasDatabase: false, adminToken: "s3cret", emails: [] },
      ),
      false,
    );
  });

  it("authorizes a verified session email on the allowlist (case-insensitive)", () => {
    const config = { hasDatabase: true, emails: ["admin@example.com"] };
    assert.equal(
      isAuthorizedAdmin({ sessionEmail: "Admin@Example.com" }, config),
      true,
    );
    assert.equal(
      isAuthorizedAdmin({ sessionEmail: "someone@else.com" }, config),
      false,
    );
    assert.equal(isAuthorizedAdmin({ sessionEmail: null }, config), false);
  });

  it("accepts EITHER a valid token OR an allowlisted email when both are configured", () => {
    const config = {
      hasDatabase: true,
      adminToken: "s3cret",
      emails: ["admin@example.com"],
    };
    assert.equal(isAuthorizedAdmin({ token: "s3cret" }, config), true);
    assert.equal(
      isAuthorizedAdmin({ sessionEmail: "admin@example.com" }, config),
      true,
    );
    assert.equal(
      isAuthorizedAdmin({ token: "x", sessionEmail: "y@z.com" }, config),
      false,
    );
  });
});

describe("submit throttle (allow)", () => {
  it("permits up to the limit then blocks within the window", () => {
    resetBuckets();
    const now = 1_000;
    assert.equal(allow("k", 3, 1000, now), true);
    assert.equal(allow("k", 3, 1000, now), true);
    assert.equal(allow("k", 3, 1000, now), true);
    assert.equal(allow("k", 3, 1000, now), false, "4th call blocked");
  });

  it("resets after the window elapses", () => {
    resetBuckets();
    assert.equal(allow("k", 1, 1000, 0), true);
    assert.equal(allow("k", 1, 1000, 500), false, "still within window");
    assert.equal(allow("k", 1, 1000, 1000), true, "window elapsed");
  });

  it("tracks keys independently", () => {
    resetBuckets();
    assert.equal(allow("a", 1, 1000, 0), true);
    assert.equal(allow("b", 1, 1000, 0), true);
    assert.equal(allow("a", 1, 1000, 0), false);
  });
});

describe("feedback DB round trip (real PGLite)", () => {
  let server: FeedbackServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as FeedbackServer;
  });

  it("starts from a genuine empty state (no seeded rows)", async () => {
    const rows = await server.listFeedback();
    assert.deepEqual(rows, [], "fresh DB must return an empty array, not mock data");
  });

  it("inserts a row and lists it back with persisted fields and defaults", async () => {
    const input: SubmitFeedbackInput = {
      type: "bug",
      title: "Crash on export",
      category: "engine",
      description: "The app crashes when exporting a large scene",
      stepsOrUseCases: "1. Load scene 2. Export",
      severityOrPriority: "high",
      rating: 2,
      userEmail: "reporter@example.com",
    };
    const inserted = await server.insertFeedback(input);

    assert.ok(inserted.id, "an id must be generated app-side");
    assert.equal(inserted.type, "bug");
    assert.equal(inserted.title, "Crash on export");
    assert.equal(inserted.category, "engine");
    assert.equal(inserted.description, input.description);
    assert.equal(inserted.steps_or_use_cases, input.stepsOrUseCases);
    assert.equal(inserted.severity_or_priority, "high");
    assert.equal(inserted.rating, 2);
    assert.equal(inserted.votes, 0, "votes defaults to 0");
    assert.equal(inserted.status, "under_review", "status defaults to under_review");
    assert.equal(inserted.user_email, "reporter@example.com");
    assert.ok(inserted.created_at, "created_at must be populated");

    const list = await server.listFeedback();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, inserted.id);
    assert.equal(list[0].title, "Crash on export");
  });

  it("leaves optional columns null when omitted", async () => {
    const inserted = await server.insertFeedback({
      type: "general",
      title: "Minimal entry",
      description: "Only required fields",
    });
    assert.equal(inserted.category, null);
    assert.equal(inserted.steps_or_use_cases, null);
    assert.equal(inserted.severity_or_priority, null);
    assert.equal(inserted.rating, null);
    assert.equal(inserted.user_email, null);
    assert.equal(inserted.votes, 0);
    assert.equal(inserted.status, "under_review");
  });

  it("updates a submission's status and reflects the change", async () => {
    const inserted = await server.insertFeedback({
      type: "feature",
      title: "Status change target",
      description: "Will be moved to completed",
    });
    assert.equal(inserted.status, "under_review");

    const updated = await server.updateFeedbackStatus(inserted.id, "completed");
    assert.ok(updated);
    assert.equal(updated.id, inserted.id);
    assert.equal(updated.status, "completed");

    const list = await server.listFeedback();
    const found = list.find((r) => r.id === inserted.id);
    assert.ok(found);
    assert.equal(found.status, "completed", "the list reflects the new status");
  });

  it("returns null when updating a non-existent submission", async () => {
    const missing = await server.updateFeedbackStatus(
      "does-not-exist",
      "planned",
    );
    assert.equal(missing, null);
  });
});
