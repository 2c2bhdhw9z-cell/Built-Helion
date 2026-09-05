import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Same loader hook as admin.integration.test.ts / creations.test.ts: it
// resolves the `@/` alias and inlines the REAL migration SQL (the top-level
// migrations/*.sql files, INCLUDING 0007_rest.sql which creates the
// `audit_logs` table this suite writes to) so we hit a genuine embedded PGLite
// database — no DB mocking, no seeded fixtures beyond the rows this test
// inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// The server modules import the `@/` alias, which only resolves once the loader
// hook above is registered; a static top-level import would be hoisted and
// resolved BEFORE register() runs. So — like the sibling integration suite —
// everything that transitively touches `@/` is imported dynamically inside a
// before() hook, after the loader is active.

type AuditServer = {
  writeAudit: (userId: string, action: string, detail?: string) => Promise<void>;
  listAllAudit: (
    limit?: number,
  ) => Promise<{ id: string; action: string; detail: string; at: string | Date; userId: string }[]>;
};

type AdminAuth = {
  isAuthorizedAdmin: typeof import("../feedback/admin-auth.server.ts").isAuthorizedAdmin;
};

let audit: AuditServer;
let adminAuth: AdminAuth;

before(async () => {
  audit = (await import("./server.ts")) as unknown as AuditServer;
  adminAuth = (await import("../feedback/admin-auth.server.ts")) as unknown as AdminAuth;
});

/**
 * Write audit entries for MULTIPLE users in a deterministic order and return
 * the total number written. `writeAudit` stamps `created_at` with the DB
 * `now()` default; to make newest-first ordering assertable across rows that
 * could otherwise share a millisecond, entries are written one-at-a-time with a
 * tiny delay between them so their timestamps strictly increase.
 */
async function seedAuditTimeline(): Promise<{ writes: { userId: string; action: string; detail: string }[] }> {
  const writes = [
    { userId: "audit-alice", action: "creation.save", detail: "Alice One" },
    { userId: "audit-bob", action: "account.suspend", detail: "bob suspended by admin" },
    { userId: "audit-alice", action: "creation.publish", detail: "Alice One public" },
    { userId: "audit-carol", action: "creation.feature", detail: "carol featured" },
    // A privileged action recorded LAST so it is the newest entry (Req 14.2).
    { userId: "audit-admin", action: "account.reinstate", detail: "bob reinstated by admin" },
  ];
  for (const w of writes) {
    await audit.writeAudit(w.userId, w.action, w.detail);
    await new Promise((r) => setTimeout(r, 5));
  }
  return { writes };
}

describe("audit data layer — listAllAudit spans all accounts, newest-first (Req 14.1)", () => {
  it("returns entries across ALL accounts ordered by recorded time descending, with the admin-wide shape", async () => {
    const { writes } = await seedAuditTimeline();

    const entries = await audit.listAllAudit(100);

    // Cross-account: the view is NOT owner-scoped — entries from every distinct
    // acting account written above must be present.
    const seenUsers = new Set(entries.map((e) => e.userId));
    for (const distinct of ["audit-alice", "audit-bob", "audit-carol", "audit-admin"]) {
      assert.ok(seenUsers.has(distinct), `entries must span all accounts — missing ${distinct}`);
    }

    // Shape (Req 14.1): every entry is exactly { id, action, detail, at, userId }.
    for (const e of entries) {
      assert.deepEqual(
        Object.keys(e).sort(),
        ["action", "at", "detail", "id", "userId"],
        "each entry has exactly the admin-wide audit shape",
      );
      assert.equal(typeof e.id, "string");
      assert.equal(typeof e.action, "string");
      assert.equal(typeof e.detail, "string");
      assert.equal(typeof e.userId, "string");
      assert.ok(e.at instanceof Date || typeof e.at === "string", "`at` is the recorded time");
    }

    // Ordering (Req 14.1): recorded time strictly non-increasing (newest first).
    const times = entries.map((e) => new Date(e.at).getTime());
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i - 1] >= times[i], "entries are ordered newest-first (created_at desc)");
    }

    // The LAST write is the most recent, so it must be the FIRST entry returned.
    const newestWrite = writes[writes.length - 1];
    assert.equal(entries[0].userId, newestWrite.userId, "the newest write leads the list");
    assert.equal(entries[0].action, newestWrite.action);
    assert.equal(entries[0].detail, newestWrite.detail);
  });
});

describe("audit data layer — limit clamp and privileged-action visibility (Reqs 14.2, 14.3)", () => {
  it("caps the result to the requested limit and surfaces a privileged action", async () => {
    await seedAuditTimeline();

    // Cap (Req 14.3): a small limit returns AT MOST that many entries. The rows
    // seeded above (plus any from the sibling describe sharing this in-process
    // PGLite) comfortably exceed 2, so the cap is genuinely exercised.
    const capped = await audit.listAllAudit(2);
    assert.ok(capped.length <= 2, "listAllAudit returns at most the requested limit");
    assert.equal(capped.length, 2, "with more rows than the limit, exactly the limit is returned");

    // Privileged action (Req 14.2): a privileged action recorded via writeAudit
    // is visible in the unbounded (clamped-to-max) view.
    const all = await audit.listAllAudit(100);
    const privileged = all.find(
      (e) => e.action === "account.reinstate" && e.userId === "audit-admin",
    );
    assert.ok(privileged, "a privileged action recorded via writeAudit shows up in the audit view");
    assert.equal(privileged.detail, "bob reinstated by admin");
  });
});

describe("audit authorization — the gate lives at the function layer (Req 14.4)", () => {
  // By design the data-layer `listAllAudit` is UNAUTHENTICATED: it performs no
  // access check. The admin gate lives in the server function `listAllAuditFn`
  // (src/lib/audit/functions.ts), which calls the shared, fail-closed
  // `assertAdmin` FIRST and maps a non-admin caller to an EMPTY list. The full
  // assertAdmin / isAuthorizedAdmin matrix is exhaustively covered by
  // src/lib/feedback/admin-auth.test.ts and is NOT re-derived here. This is a
  // light assertion, through the pure decision function, that a non-admin
  // config denies — which is what the function layer turns into "no entries".
  it("isAuthorizedAdmin denies a non-admin caller (the gate the function layer enforces)", () => {
    const denied = adminAuth.isAuthorizedAdmin(
      { token: "wrong-token", sessionEmail: "nobody@test.local", sessionEmailVerified: false },
      { hasDatabase: true, adminToken: "the-real-secret", emails: ["admin@test.local"] },
    );
    assert.equal(denied, false, "a non-admin caller must be denied at the gate");

    // Sanity: the correct token authorizes, proving the deny above is meaningful
    // rather than a blanket false.
    const allowed = adminAuth.isAuthorizedAdmin(
      { token: "the-real-secret" },
      { hasDatabase: true, adminToken: "the-real-secret", emails: [] },
    );
    assert.equal(allowed, true, "the correct token authorizes");
  });
});
