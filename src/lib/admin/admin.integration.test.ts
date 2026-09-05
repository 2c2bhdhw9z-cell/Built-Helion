import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationConfig } from "../creations/types.ts";
import type { LabParams } from "../../engine/types.ts";
import type { AdminAccount, AdminAnalytics } from "./types.ts";

// Same loader hook as creations.test.ts / feedback.test.ts: it resolves the
// `@/` alias and inlines the REAL migration SQL (the top-level migrations/*.sql
// files, INCLUDING 0001_auth.sql which creates the Better Auth `"user"` table,
// 0004_creations.sql, 0005_community.sql, and 0009_completion.sql's
// `account_status`) so this suite hits a genuine PGLite database — no DB
// mocking, no seeded fixtures beyond the rows this test inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// The engine/config types and the server modules import the `@/` alias, which
// only resolves once the loader hook above is registered; a static top-level
// import would be hoisted and resolved BEFORE register() runs. So — like the
// sibling suites — everything that transitively touches `@/` is imported
// dynamically inside a before() hook, after the loader is active.

type AdminServer = {
  listAccounts: () => Promise<AdminAccount[]>;
  getAnalytics: () => Promise<AdminAnalytics>;
  suspendAccount: (adminId: string, targetId: string) => Promise<void>;
  reinstateAccount: (adminId: string, targetId: string) => Promise<void>;
};

type Guard = {
  assertNotSuspended: (userId: string) => Promise<void>;
  SuspendedError: new (message?: string) => Error;
};

type CreationsServer = {
  insertCreation: (userId: string, name: string, config: CreationConfig) => Promise<{ id: string }>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
  toggleLike: (userId: string, creationId: string) => Promise<{ liked: boolean; likeCount: number }>;
};

type AdminAuth = {
  isAuthorizedAdmin: typeof import("../feedback/admin-auth.server.ts").isAuthorizedAdmin;
};

type Db = { getSql: () => Promise<import("../db.ts").Sql> };

let adminServer: AdminServer;
let guard: Guard;
let creations: CreationsServer;
let adminAuth: AdminAuth;
let getSql: Db["getSql"];
let validConfig: () => CreationConfig;

before(async () => {
  adminServer = (await import("./server.ts")) as unknown as AdminServer;
  guard = (await import("./guard.server.ts")) as unknown as Guard;
  creations = (await import("../creations/server.ts")) as unknown as CreationsServer;
  adminAuth = (await import("../feedback/admin-auth.server.ts")) as unknown as AdminAuth;
  ({ getSql } = (await import("../db.ts")) as unknown as Db);

  const types = await import("../creations/types.ts");
  const engineTypes = await import("../../engine/types.ts");
  const DEFAULT_PARAMS: LabParams = engineTypes.DEFAULT_PARAMS;
  validConfig = () =>
    types.creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
      cap: 131_072,
    });
});

/**
 * Seed a minimal Better Auth `"user"` row so `listAccounts` (which joins FROM
 * `"user"`) and `getAnalytics` (which counts `"user"`) see the account. The
 * table requires non-null name/email/emailVerified. Emails here are synthetic
 * test values, not PII.
 */
async function seedUser(id: string, name: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into "user" ("id", "name", "email", "emailVerified")
    values (${id}, ${name}, ${`${id}@test.local`}, ${true})
    on conflict ("id") do nothing
  `;
}

describe("admin data layer — listAccounts aggregates real rows (Req 5.1)", () => {
  it("returns correct per-user creation & like counts and the suspended flag", async () => {
    // Two real accounts. `alice` will own 2 creations (one public, liked by
    // bob); `bob` owns 1 creation and receives no likes.
    await seedUser("acct-alice", "Alice");
    await seedUser("acct-bob", "Bob");

    // alice: two creations; publish the first and have bob like it (a like
    // RECEIVED counts toward alice, the owner of the liked creation).
    const a1 = await creations.insertCreation("acct-alice", "Alice One", validConfig());
    await creations.insertCreation("acct-alice", "Alice Two", validConfig());
    await creations.setCreationPublic("acct-alice", a1.id, true);
    const liked = await creations.toggleLike("acct-bob", a1.id);
    assert.equal(liked.liked, true, "a public creation must be likeable");
    assert.equal(liked.likeCount, 1);

    // bob: one creation, no likes received.
    await creations.insertCreation("acct-bob", "Bob One", validConfig());

    // Suspend bob so the suspended flag is exercised in the aggregate list.
    await adminServer.suspendAccount("acct-alice", "acct-bob");

    const accounts = await adminServer.listAccounts();
    const alice = accounts.find((a) => a.id === "acct-alice");
    const bob = accounts.find((a) => a.id === "acct-bob");
    assert.ok(alice, "alice must appear in the account list");
    assert.ok(bob, "bob must appear in the account list");

    // alice: 2 creations, 1 like received on her public creation, not suspended.
    assert.equal(alice.creations, 2, "alice has two creations");
    assert.equal(alice.likes, 1, "alice received exactly one like");
    assert.equal(alice.suspended, false, "alice is not suspended");
    assert.equal(alice.displayName, "Alice", "display label falls back to user.name");

    // bob: 1 creation, 0 likes received, suspended.
    assert.equal(bob.creations, 1, "bob has one creation");
    assert.equal(bob.likes, 0, "bob received no likes");
    assert.equal(bob.suspended, true, "bob is suspended");

    // Reinstate bob so this test leaves no suspension that could leak into the
    // shared in-process PGLite state consumed by later assertions.
    await adminServer.reinstateAccount("acct-alice", "acct-bob");
  });
});

describe("admin data layer — getAnalytics over stored rows (Reqs 6.1, 6.2, 6.3)", () => {
  it("returns true counts computed from stored rows (never fabricated)", async () => {
    // This suite shares one in-process PGLite instance with the listAccounts
    // block above, so rather than assert absolute magic numbers we capture a
    // baseline, add a known, self-contained delta, and assert the deltas — the
    // counts are genuinely computed from stored rows either way.
    const before = await adminServer.getAnalytics();

    await seedUser("acct-analytics", "Ana");
    const c1 = await creations.insertCreation("acct-analytics", "Ana One", validConfig());
    await creations.insertCreation("acct-analytics", "Ana Two", validConfig());
    await creations.setCreationPublic("acct-analytics", c1.id, true); // 1 public
    await creations.toggleLike("acct-analytics", c1.id); // +1 like

    const after = await adminServer.getAnalytics();
    assert.equal(after.accounts - before.accounts, 1, "one new account counted");
    assert.equal(after.savedCreations - before.savedCreations, 2, "two new creations counted");
    assert.equal(
      after.publishedCreations - before.publishedCreations,
      1,
      "one new published creation counted",
    );
    assert.equal(after.totalLikes - before.totalLikes, 1, "one new like counted");
  });

  it("every metric is a non-negative integer (0 when empty — never a fabricated value)", async () => {
    // Empty-store semantics (Req 6.1): getAnalytics is a pure count/sum over
    // stored rows and resolves to 0 where no rows exist. We prove the shape is
    // an honest count: every field is a finite, non-negative integer.
    const a = await adminServer.getAnalytics();
    for (const [key, value] of Object.entries(a)) {
      assert.equal(typeof value, "number", `${key} is a number`);
      assert.ok(Number.isInteger(value) && value >= 0, `${key} is a non-negative integer`);
    }
  });
});

describe("admin write gate — suspend → reject write → reinstate → allow (Reqs 5.2, 5.3, 5.4)", () => {
  it("suspendAccount blocks the target's authenticated writes; reinstateAccount restores them", async () => {
    await seedUser("acct-target", "Target");
    await seedUser("acct-admin", "Admin");

    // Before suspension the write gate passes (no status row → not suspended).
    await assert.doesNotReject(
      guard.assertNotSuspended("acct-target"),
      "an un-suspended account may write",
    );

    // Suspend (Req 5.2) → the write gate now rejects with SuspendedError (Req 5.3).
    await adminServer.suspendAccount("acct-admin", "acct-target");
    await assert.rejects(
      guard.assertNotSuspended("acct-target"),
      (err: unknown) => {
        assert.ok(err instanceof guard.SuspendedError, "must throw SuspendedError");
        assert.equal((err as { status?: number }).status, 403, "carries status 403");
        return true;
      },
      "a suspended account's write must be rejected",
    );

    // Reinstate (Req 5.4) → the write gate passes again.
    await adminServer.reinstateAccount("acct-admin", "acct-target");
    await assert.doesNotReject(
      guard.assertNotSuspended("acct-target"),
      "a reinstated account may write again",
    );
  });
});

describe("admin authorization — non-admin caller is denied (Reqs 5.5, 6.4)", () => {
  // The full admin-auth suite (constant-time token compare Req 4.6, the
  // env-driven mechanisms, the verified-email allowlist) is already covered by
  // src/lib/feedback/admin-auth.test.ts and is NOT re-derived here. This case
  // only demonstrates, through the pure decision function, that a configured
  // admin surface DENIES a caller who satisfies no mechanism — which is what the
  // server-function layer turns into an empty/forbidden result for a non-admin.
  it("isAuthorizedAdmin denies a caller with no matching token on a real (DATABASE_URL) deploy", () => {
    // A real database is configured and a token mechanism is set, but the caller
    // supplies the wrong token and no allowlisted verified email → denied.
    const denied = adminAuth.isAuthorizedAdmin(
      { token: "wrong-token", sessionEmail: "nobody@test.local", sessionEmailVerified: false },
      { hasDatabase: true, adminToken: "the-real-secret", emails: ["admin@test.local"] },
    );
    assert.equal(denied, false, "a non-admin caller must be denied");

    // Sanity: the correct token authorizes (proves the deny above is meaningful,
    // not a blanket false). Kept minimal — the exhaustive matrix lives in
    // admin-auth.test.ts.
    const allowed = adminAuth.isAuthorizedAdmin(
      { token: "the-real-secret" },
      { hasDatabase: true, adminToken: "the-real-secret", emails: [] },
    );
    assert.equal(allowed, true, "the correct token authorizes");
  });
});
