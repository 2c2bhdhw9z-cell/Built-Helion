import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Same loader hook as creations.test.ts / admin.integration.test.ts: it resolves
// the `@/` alias and inlines the REAL migration SQL (the top-level
// migrations/*.sql files, INCLUDING 0010's `api_rate_limits`) so this suite hits
// a genuine PGLite database — no DB mocking, no seeded fixtures.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// rate-limit.ts imports the `@/` alias (getSql, the feedback throttle), which
// only resolves once the loader hook above is registered; a static top-level
// import would be hoisted and resolved BEFORE register() runs. So — like the
// sibling suites — the module is imported dynamically inside a before() hook.

type RateLimit = {
  allowV1: (key: string, now?: number) => Promise<boolean>;
  readV1Quota: (
    key: string,
    now?: number,
  ) => Promise<{ used: number; limit: number; windowMs: number; resetMs: number }>;
  userRateLimitKey: (userId: string) => string;
  isWithinLimit: (countIncludingThis: number, limit?: number) => boolean;
  windowStart: (now: number, windowMs?: number) => number;
  V1_LIMIT: number;
  V1_WINDOW_MS: number;
};

type Db = { getSql: () => Promise<import("../db.ts").Sql> };

let rl: RateLimit;
let getSql: Db["getSql"];

before(async () => {
  rl = (await import("./rate-limit.ts")) as unknown as RateLimit;
  ({ getSql } = (await import("../db.ts")) as unknown as Db);
});

describe("rate-limit pure helpers (Req 11)", () => {
  it("isWithinLimit passes up to and including the limit, rejects beyond", () => {
    assert.equal(rl.isWithinLimit(1, 60), true);
    assert.equal(rl.isWithinLimit(60, 60), true, "the 60th request is allowed");
    assert.equal(rl.isWithinLimit(61, 60), false, "the 61st request is blocked");
  });

  it("windowStart floors a timestamp to its fixed window bucket", () => {
    const w = rl.V1_WINDOW_MS;
    assert.equal(rl.windowStart(0, w), 0);
    assert.equal(rl.windowStart(w - 1, w), 0, "still in the first window");
    assert.equal(rl.windowStart(w, w), w, "next window starts exactly at w");
    assert.equal(rl.windowStart(w + 5, w), w);
  });
});

describe("allowV1 durable counter over real PGLite (Req 11)", () => {
  it("blocks after the limit within a window and resets when the window rolls over", async () => {
    // Pin a fixed `now` inside one window so every call shares the same bucket.
    const base = 1_000 * rl.V1_WINDOW_MS; // an arbitrary window boundary
    const key = "test-ip-block";

    // The first V1_LIMIT requests in the window are allowed...
    for (let i = 1; i <= rl.V1_LIMIT; i++) {
      const allowed = await rl.allowV1(key, base + 1);
      assert.equal(allowed, true, `request ${i} within the limit must be allowed`);
    }
    // ...and the next one (over the limit) is blocked.
    const overLimit = await rl.allowV1(key, base + 2);
    assert.equal(overLimit, false, "a request over the limit must be blocked");

    // Rolling into the NEXT window resets the counter — the first request there
    // is allowed again (durable across the window boundary, per-key).
    const nextWindow = base + rl.V1_WINDOW_MS;
    const afterReset = await rl.allowV1(key, nextWindow + 1);
    assert.equal(afterReset, true, "a new window must reset the per-key counter");
  });

  it("counts each key independently (one key hitting its limit does not affect another)", async () => {
    const base = 2_000 * rl.V1_WINDOW_MS;
    const busy = "busy-key";
    const quiet = "quiet-key";

    // Exhaust `busy` within the window.
    for (let i = 1; i <= rl.V1_LIMIT; i++) {
      await rl.allowV1(busy, base + 1);
    }
    assert.equal(await rl.allowV1(busy, base + 1), false, "busy key is now blocked");

    // `quiet` in the same window is unaffected — its own bucket is empty.
    assert.equal(await rl.allowV1(quiet, base + 1), true, "a different key has its own counter");
  });

  it("globally sweeps expired windows for OTHER keys, not just the key being hit", async () => {
    const sql = await getSql();
    const base = 4_000 * rl.V1_WINDOW_MS;

    // Seed a stale window row for a key that will NOT receive any more traffic —
    // exactly the "quiet key leaves rows behind forever" case the per-key sweep
    // misses. Its window is one full window BEFORE `base`.
    const quietKey = "v1:quiet-abandoned-key";
    const staleWindow = base - rl.V1_WINDOW_MS;
    await sql`
      insert into api_rate_limits (key, window_start, count)
      values (${quietKey}, ${staleWindow}, 7)
      on conflict (key, window_start) do update set count = excluded.count
    `;

    const seeded = await sql<{ count: number | string }>`
      select count(*) as count from api_rate_limits
      where key = ${quietKey} and window_start = ${staleWindow}
    `;
    assert.equal(Number(seeded[0]?.count), 1, "the stale row for the quiet key is seeded");

    // Hit a DIFFERENT key in a later window. The global cleanup is throttled to
    // once per window per process; the sibling suites above already ran in
    // earlier windows, and this window (`base`) is fresh, so the very first hit
    // here rolls the window over and deterministically fires the global sweep.
    const allowed = await rl.allowV1("busy-different-key", base + 1);
    assert.equal(allowed, true, "the request itself is allowed (cleanup never blocks it)");

    // The global sweep is fire-and-forget, so give the microtask/DB round-trip a
    // moment to complete before asserting the stale row is gone. This is not the
    // rate-limit decision path — only the best-effort cleanup — so a short wait
    // here is about the async delete, not the (synchronous, already-returned)
    // decision.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const after = await sql<{ count: number | string }>`
      select count(*) as count from api_rate_limits
      where key = ${quietKey} and window_start = ${staleWindow}
    `;
    assert.equal(
      Number(after[0]?.count),
      0,
      "the quiet key's expired window row was globally cleaned up",
    );

    // Sanity: the current-window row for the key we hit is still present (only
    // windows OLDER than the current one are swept, so live counters survive).
    const live = await sql<{ count: number | string }>`
      select count(*) as count from api_rate_limits
      where key = 'v1:busy-different-key' and window_start = ${base}
    `;
    assert.equal(Number(live[0]?.count), 1, "the live current-window counter is retained");
  });

  // Finding 1 (BLOCKING): the developer usage/quota widget must show the SAME
  // counter that actually throttles the account. `handleV1` enforces the limit
  // for an authenticated request against `userRateLimitKey(userId)`, and
  // `getUsageViewFn` reads the widget's `used` via `readV1Quota` of that SAME
  // key. This test pins both to a shared window and asserts the read equals the
  // number of enforced requests — the assertion whose absence let the bug
  // through (read was `v1:<userId>`, enforcement was `v1:<ip>`).
  it("readV1Quota reports exactly the count allowV1 enforced for the same principal key", async () => {
    const base = 5_000 * rl.V1_WINDOW_MS;
    const now = base + 1;
    const userId = "quota-match-user";
    const key = rl.userRateLimitKey(userId);

    // Before any traffic the widget shows 0 used.
    const start = await rl.readV1Quota(key, now);
    assert.equal(start.used, 0, "an untouched principal shows 0 used");
    assert.equal(start.limit, rl.V1_LIMIT, "the reported limit is the policy limit");

    // Enforce N requests against the SAME key the widget reads.
    const N = 5;
    for (let i = 0; i < N; i++) {
      await rl.allowV1(key, now);
    }

    // The widget's `used` equals the enforced count — read and enforcement
    // share one bucket. (Read-only peek must NOT increment.)
    const afterN = await rl.readV1Quota(key, now);
    assert.equal(afterN.used, N, "readV1Quota reflects the enforced request count");
    const peekAgain = await rl.readV1Quota(key, now);
    assert.equal(peekAgain.used, N, "reading the quota does not itself increment the counter");
  });

  it("is shared/durable: a second call in the same window sees the first call's count", async () => {
    // Simulates two serverless instances hitting the same shared row: the second
    // increment observes the first (the count is authoritative in Postgres, not
    // per-process), so the window's running total is consistent across callers.
    const base = 3_000 * rl.V1_WINDOW_MS;
    const key = "shared-window-key";
    for (let i = 1; i < rl.V1_LIMIT; i++) {
      assert.equal(await rl.allowV1(key, base + 1), true);
    }
    // The V1_LIMIT-th request (the boundary) is still allowed...
    assert.equal(await rl.allowV1(key, base + 1), true, "the limit-th request is allowed");
    // ...and the very next one is blocked, proving all prior calls accumulated
    // into the SAME shared window row.
    assert.equal(await rl.allowV1(key, base + 1), false, "the over-limit request is blocked");
  });
});
