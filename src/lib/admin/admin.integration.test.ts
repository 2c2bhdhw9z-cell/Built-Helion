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
  getDashboardAnalytics: () => Promise<import("./types.ts").AdminDashboardAnalytics>;
  TOP_GENERATORS: number;
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

describe("getDashboardAnalytics — generator popularity is aggregated in SQL (Req 12)", () => {
  // These cases prove correctness through the NEW bounded SQL query path
  // (jsonb_each_text + GROUP BY, ordered count desc / label asc, capped to
  // TOP_GENERATORS) rather than through a pure JS helper. Every generator label
  // here is uniquely prefixed ("gp-…") so no other seeded row in the shared
  // PGLite instance can contribute to these counts, letting us assert exact
  // totals, ordering, and garbage rejection directly on the returned slices.
  // The ranking is a GLOBAL top-N over the whole `usage_stats` table, so seeded
  // rows here would otherwise crowd the low-count generators the sibling
  // "aggregates real usage/telemetry rows" suite relies on out of the top-N.
  // Each case cleans up its own seeded rows afterwards so the shared PGLite
  // instance is left as it was found.
  async function clearUsage(...ids: string[]): Promise<void> {
    const sql = await getSql();
    for (const id of ids) {
      await sql`delete from usage_stats where user_id = ${id}`;
    }
  }

  it("sums per-account maps, ranks desc, breaks ties by label, and rejects garbage", async () => {
    const sql = await getSql();
    // gp-galaxy = 3 + 2 + round(2.6)=3 => 8 ; gp-flock = 4 ; gp-ring = 1 + 1 => 2.
    // Garbage in the last account must NOT inject a slice: a negative count, an
    // empty label, a whitespace-only label, and a non-numeric value. Counts are
    // small on purpose so they never displace other rows from the global top-N;
    // we assert on our own uniquely-prefixed slices only.
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('gp-a', 0, 0, 0, 0, ${JSON.stringify({ "gp-galaxy": 3, "gp-ring": 1 })}, now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('gp-b', 0, 0, 0, 0, ${JSON.stringify({ "gp-galaxy": 2, "gp-flock": 4 })}, now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('gp-c', 0, 0, 0, 0, ${JSON.stringify({ "gp-ring": 1 })}, now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('gp-garbage', 0, 0, 0, 0,
        ${JSON.stringify({ "gp-galaxy": 2.6, "gp-neg": -5, "": 99, "  ": 7, "gp-bad": "nope" })},
        now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;

    try {
      // Raise TOP_GENERATORS's effective reach for the assertion by asking the
      // query directly is not needed — our labels are unique, but with a global
      // top-N we can only guarantee OUR slices appear if they're within the top
      // TOP_GENERATORS overall. Keep counts modest and assert relative ordering
      // among the gp-* slices that surface plus exact totals for those present.
      const { popularGenerators } = await adminServer.getDashboardAnalytics();
      const mine = popularGenerators.filter((s) => s.label.startsWith("gp-"));
      const byLabel = new Map(mine.map((s) => [s.label, s.count]));
      // Exact per-generator totals through the SQL path (sum with rounding).
      assert.equal(byLabel.get("gp-galaxy"), 8, "gp-galaxy = 3 + 2 + round(2.6)");
      assert.equal(byLabel.get("gp-flock"), 4, "gp-flock = 4");
      assert.equal(byLabel.get("gp-ring"), 2, "gp-ring = 1 + 1");
      // Ranking among our slices: galaxy (8) > flock (4) > ring (2).
      const order = mine.map((s) => s.label);
      assert.ok(
        order.indexOf("gp-galaxy") < order.indexOf("gp-flock"),
        "gp-galaxy outranks gp-flock",
      );
      assert.ok(
        order.indexOf("gp-flock") < order.indexOf("gp-ring"),
        "gp-flock outranks gp-ring",
      );
      // Garbage labels never appear anywhere in the ranking.
      for (const bad of ["gp-neg", "gp-bad", "", "  "]) {
        assert.ok(
          !popularGenerators.some((s) => s.label === bad),
          `garbage label ${JSON.stringify(bad)} must not appear`,
        );
      }
    } finally {
      await clearUsage("gp-a", "gp-b", "gp-c", "gp-garbage");
    }
  });

  it("caps the ranking to TOP_GENERATORS and returns the highest-count ones in order", async () => {
    const sql = await getSql();
    const limit = adminServer.TOP_GENERATORS;
    // Seed strictly more distinct generators than the cap, with STRICTLY
    // DESCENDING counts that are all large enough to dominate every other row in
    // the shared table, so the global top-N is composed entirely of our
    // cap-* slices. The query must then return exactly `limit` of them, in
    // descending order, proving the LIMIT bound holds through the SQL path.
    const total = limit + 5;
    const map: Record<string, number> = {};
    for (let i = 0; i < total; i++) {
      // Zero-pad so the label ordering is well-defined; counts start high
      // (1_000 + …) so they outrank any incidental generator in the instance.
      map[`cap-${String(i).padStart(3, "0")}`] = 1_000 + (total - i);
    }
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('cap-user', 0, 0, 0, 0, ${JSON.stringify(map)}, now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;

    try {
      const { popularGenerators } = await adminServer.getDashboardAnalytics();
      // Every returned slice is one of ours (they dominate the whole table), and
      // the list is capped to exactly TOP_GENERATORS.
      assert.equal(popularGenerators.length, limit, "ranking is capped to TOP_GENERATORS");
      assert.ok(
        popularGenerators.every((s) => s.label.startsWith("cap-")),
        "the dominating cap-* generators fill the entire top-N",
      );
      // Descending by count.
      for (let i = 1; i < popularGenerators.length; i++) {
        assert.ok(
          popularGenerators[i - 1].count >= popularGenerators[i].count,
          "slices are ordered by count desc",
        );
      }
      // The very top slice is the highest-count generator we seeded.
      assert.equal(popularGenerators[0].label, "cap-000", "the highest-count generator leads");
      assert.equal(popularGenerators[0].count, 1_000 + total);
      // The lowest-count generators (below the cap) are excluded.
      assert.ok(
        !popularGenerators.some(
          (s) => s.label === `cap-${String(total - 1).padStart(3, "0")}`,
        ),
        "generators beyond the top-N cap are excluded",
      );
    } finally {
      await clearUsage("cap-user");
    }
  });

  it("empty generators map contributes no slices (never fabricated rows)", async () => {
    const sql = await getSql();
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('gp-empty', 0, 0, 0, 0, ${JSON.stringify({})}, now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;
    try {
      const { popularGenerators } = await adminServer.getDashboardAnalytics();
      assert.ok(
        !popularGenerators.some((s) => s.label === "gp-empty"),
        "an empty map injects no slice",
      );
    } finally {
      await clearUsage("gp-empty");
    }
  });
});

describe("getDashboardAnalytics — aggregates real usage/telemetry rows (Req 12)", () => {
  it("computes active users, popular generators, and device/particle breakdowns", async () => {
    const sql = await getSql();

    // Baseline so we assert DELTAS (this suite shares one PGLite instance).
    const before = await adminServer.getDashboardAnalytics();

    // Two accounts with recent usage (active), generators recorded.
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('dash-u1', 10, 5, 0, 100, ${JSON.stringify({ galaxy: 4, ring: 1 })}, now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('dash-u2', 20, 9, 1, 200, ${JSON.stringify({ galaxy: 2, flock: 3 })}, now())
      on conflict (user_id) do update set generators = excluded.generators, updated_at = now()
    `;
    // One STALE account (updated_at well outside the 30-day window) → not active.
    await sql`
      insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
      values ('dash-stale', 1, 1, 0, 1, ${JSON.stringify({ ring: 9 })}, now() - interval '90 days')
      on conflict (user_id) do update set updated_at = now() - interval '90 days'
    `;

    // Telemetry samples across two device tiers and two particle buckets.
    await sql`insert into telemetry_samples (id, fps_avg, frame_ms_p95, dropped_frames, particle_bucket, device_tier) values ('dash-t1', 60, 16, 0, 1000, 'high')`;
    await sql`insert into telemetry_samples (id, fps_avg, frame_ms_p95, dropped_frames, particle_bucket, device_tier) values ('dash-t2', 55, 18, 1, 1000, 'high')`;
    await sql`insert into telemetry_samples (id, fps_avg, frame_ms_p95, dropped_frames, particle_bucket, device_tier) values ('dash-t3', 30, 33, 5, 5000, 'low')`;

    const after = await adminServer.getDashboardAnalytics();

    // Active users advanced by exactly the two recent accounts (the stale one is
    // excluded), so the delta is 2.
    assert.equal(after.activeUsers - before.activeUsers, 2, "two recently-active accounts");

    // Popular generators reflect the summed maps of the recent accounts (and any
    // shared-instance rows). galaxy = 4 + 2 = 6 must be present and lead flock=3.
    const galaxy = after.popularGenerators.find((s) => s.label === "galaxy");
    const flock = after.popularGenerators.find((s) => s.label === "flock");
    assert.ok(galaxy, "galaxy must appear among popular generators");
    assert.ok(galaxy.count >= 6, "galaxy count includes both accounts' usage");
    if (flock) assert.ok(galaxy.count >= flock.count, "generators are ranked by count desc");

    // Device tiers: the 'high' tier gained 2 samples, 'low' gained 1.
    const high = after.deviceTiers.find((s) => s.label === "high");
    const low = after.deviceTiers.find((s) => s.label === "low");
    const highBefore = before.deviceTiers.find((s) => s.label === "high")?.count ?? 0;
    const lowBefore = before.deviceTiers.find((s) => s.label === "low")?.count ?? 0;
    assert.ok(high, "the 'high' device tier must appear");
    assert.ok(low, "the 'low' device tier must appear");
    assert.equal(high.count - highBefore, 2, "two new 'high' samples");
    assert.equal(low.count - lowBefore, 1, "one new 'low' sample");

    // Total telemetry samples advanced by 3, and equals the sum of tier counts.
    assert.equal(after.telemetrySamples - before.telemetrySamples, 3);
    assert.equal(
      after.telemetrySamples,
      after.deviceTiers.reduce((acc, s) => acc + s.count, 0),
      "telemetrySamples equals the summed tier counts",
    );

    // Particle buckets are ascending by bucket value (chart reads low → high).
    const buckets = after.particleBuckets.map((s) => Number(s.label));
    for (let i = 1; i < buckets.length; i++) {
      assert.ok(buckets[i - 1] <= buckets[i], "particle buckets ascend");
    }
  });
});
