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
  isWithinLimit: (countIncludingThis: number, limit?: number) => boolean;
  windowStart: (now: number, windowMs?: number) => number;
  V1_LIMIT: number;
  V1_WINDOW_MS: number;
};

let rl: RateLimit;

before(async () => {
  rl = (await import("./rate-limit.ts")) as unknown as RateLimit;
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
