import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fc from "fast-check";
import type { UsageStats } from "../play/analytics.ts";

// `mergeUsageMath` is a PURE export from ./server.ts, but that module statically
// imports `getSql` from `@/lib/db`, which (a) uses the `@/` alias and (b) loads
// migrations via Vite's `import.meta.glob` — neither of which works under plain
// `node --experimental-strip-types`. So, exactly like creations.test.ts /
// feedback.test.ts, register the loader hook that resolves the alias and inlines
// the real migration SQL, then import server.ts DYNAMICALLY in a before() hook
// (a static top-level import would be hoisted and resolved before register()
// runs). No DB is touched by these tests — mergeUsageMath is pure arithmetic.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type UsageServer = typeof import("./server.ts");
let mergeUsageMath: UsageServer["mergeUsageMath"];

before(async () => {
  ({ mergeUsageMath } = await import("./server.ts"));
});

/** A UsageStats delta literal for the integration tests below. */
const delta = (over: Partial<UsageStats> = {}): UsageStats => ({
  seconds: 0,
  spawns: 0,
  exports: 0,
  peak: 0,
  generators: {},
  ...over,
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A non-negative counter value in a range mergeUsageMath rounds/clamps cleanly. */
const counter = () => fc.integer({ min: 0, max: 1_000_000 });

/** A generators map with a small key space so replays/accumulation are meaningful. */
const generators = () =>
  fc.dictionary(
    fc.constantFrom("galaxy", "ring", "flock", "crystal", "nebula"),
    fc.integer({ min: 0, max: 5_000 }),
    { maxKeys: 5 },
  );

/** A UsageStats value with non-negative fields. */
const usage = (): fc.Arbitrary<UsageStats> =>
  fc.record({
    seconds: counter(),
    spawns: counter(),
    exports: counter(),
    peak: counter(),
    generators: generators(),
  });

/** A monotonic sequence value. */
const seq = () => fc.integer({ min: 0, max: 100_000 });

// ---------------------------------------------------------------------------
// Property 3: Usage merge adds a delta at most once per activity increment
// ---------------------------------------------------------------------------

// Feature: helion-completion, Property 3: Usage merge adds a delta at most once
// per activity increment — for any sequence of flushes carrying non-decreasing
// activitySeq values, applying the sequence (including arbitrary replays of the
// same activitySeq) yields totals equal to applying only the strictly-increasing
// subsequence exactly once; a replayed/stale flush never increases totals.
describe("Property 3: usage merge applies a delta at most once per activity increment", () => {
  it("replaying flushes with non-decreasing seq matches the strictly-increasing subsequence", () => {
    fc.assert(
      fc.property(
        usage(),
        // A list of (delta, seqStep) flushes. seqStep === 0 replays the SAME
        // activitySeq (a stale/replayed flush); seqStep > 0 advances it. This
        // builds an arbitrary non-decreasing activitySeq sequence with replays.
        fc.array(
          fc.record({
            delta: usage(),
            seqStep: fc.integer({ min: 0, max: 3 }),
          }),
          { maxLength: 30 },
        ),
        (start, flushes) => {
          // Normalize `start` through the pure merge once (a no-op merge) so both
          // folds begin from the same clamped/plain-object shape. fast-check may
          // hand us null-prototype records, and mergeUsageMath always returns a
          // freshly-built plain object — comparing raw vs normalized would be a
          // false mismatch, so we normalize both sides identically up front.
          const normStart = mergeUsageMath(start, start, 1, 0).next;

          // Fold the full flush sequence (with replays) through mergeUsageMath,
          // threading the persisted seq forward exactly as mergeAccountUsage does.
          let curReal = normStart;
          let storedReal = 0;
          let activitySeq = 0;
          // In parallel, apply ONLY the strictly-increasing flushes exactly once.
          let curExpected = normStart;
          let storedExpected = 0;

          for (const { delta, seqStep } of flushes) {
            activitySeq += seqStep; // non-decreasing; seqStep 0 = replay
            const real = mergeUsageMath(curReal, delta, storedReal, activitySeq);
            curReal = real.next;
            storedReal = real.seq;

            if (activitySeq > storedExpected) {
              const exp = mergeUsageMath(curExpected, delta, storedExpected, activitySeq);
              curExpected = exp.next;
              storedExpected = exp.seq;
            }
          }

          assert.deepEqual(curReal, curExpected);
          assert.equal(storedReal, storedExpected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("a stale or equal seq is a no-op that never increases totals", () => {
    fc.assert(
      fc.property(usage(), usage(), seq(), fc.integer({ min: 0, max: 100_000 }), (current, delta, stored, incoming) => {
        const res = mergeUsageMath(current, delta, stored, incoming);
        if (incoming <= stored) {
          // Not applied: totals are the (normalized) current totals unchanged,
          // the persisted seq stays at stored, and nothing grew.
          assert.equal(res.applied, false);
          assert.equal(res.seq, stored);
          const normalizedCurrent = mergeUsageMath(current, delta, incoming, incoming).next;
          assert.deepEqual(res.next, normalizedCurrent);
          assert.equal(res.next.seconds, current.seconds);
          assert.equal(res.next.spawns, current.spawns);
          assert.equal(res.next.exports, current.exports);
          assert.equal(res.next.peak, current.peak);
        } else {
          assert.equal(res.applied, true);
          assert.equal(res.seq, incoming);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Usage merge is monotonic and non-negative
// ---------------------------------------------------------------------------

// Feature: helion-completion, Property 4: Usage merge is monotonic and
// non-negative — for any current totals and any delta with non-negative fields,
// the merged totals are >= current in every counter, and peak equals the maximum
// of the current and delta peaks.
describe("Property 4: applied usage merge is monotonic and non-negative", () => {
  it("merged totals never decrease any counter and peak is the max", () => {
    fc.assert(
      fc.property(usage(), usage(), seq(), (current, delta, stored) => {
        // Force application by supplying an incoming seq strictly greater than stored.
        const incoming = stored + 1;
        const { next, applied } = mergeUsageMath(current, delta, stored, incoming);
        assert.equal(applied, true);

        // Every counter is non-negative...
        assert.ok(next.seconds >= 0);
        assert.ok(next.spawns >= 0);
        assert.ok(next.exports >= 0);
        assert.ok(next.peak >= 0);

        // ...and monotonic (>= the current totals, which are themselves clamped
        // to non-negative integers by the merge).
        assert.ok(next.seconds >= current.seconds);
        assert.ok(next.spawns >= current.spawns);
        assert.ok(next.exports >= current.exports);
        assert.ok(next.peak >= current.peak);

        // peak is exactly the max of the two peaks (both clamped to >= 0 ints).
        const expectedPeak = Math.max(Math.max(0, Math.round(current.peak)), Math.max(0, Math.round(delta.peak)));
        assert.equal(next.peak, expectedPeak);

        // Every generator counter is non-negative and >= its prior value.
        for (const [k, v] of Object.entries(next.generators)) {
          assert.ok(v >= 0, `generator ${k} must be non-negative`);
          const prior = Math.max(0, Math.round(current.generators[k] ?? 0));
          assert.ok(v >= prior, `generator ${k} must not decrease`);
        }
      }),
      { numRuns: 200 },
    );
  });
});


// ---------------------------------------------------------------------------
// Integration tests: usage-flush idempotency against a REAL usage_stats row
// with last_activity_seq (Task 2.7)
//
// EXAMPLE-based integration tests (NOT property tests) against a real embedded
// PGLite database via the glob loader registered at the top of this file. They
// drive mergeAccountUsage / readAccountUsage exactly as the usage server
// function does — no DB mocking, no seeded rows — and assert the at-most-once
// guarantee the last_activity_seq high-water mark provides.
//
// Covers:
//   - a repeated flush with the same/lower activitySeq does NOT double-count,
//     and a strictly-higher seq applies (Req 3.3)
//   - peak is the max of the current and delta peaks (Req 3.2)
//   - accumulation of applied deltas (Reqs 3.2, 3.4)
// ---------------------------------------------------------------------------

type UsageServerDb = {
  mergeAccountUsage: (userId: string, delta: UsageStats, activitySeq?: number) => Promise<UsageStats>;
  readAccountUsage: (userId: string) => Promise<UsageStats>;
};

describe("usage flush idempotency (real PGLite usage_stats + last_activity_seq, Task 2.7)", () => {
  let server: UsageServerDb;

  before(async () => {
    server = (await import("./server.ts")) as unknown as UsageServerDb;
  });

  it("starts from a genuine empty account (no seeded rows)", async () => {
    const u = await server.readAccountUsage("usage-empty-user");
    assert.deepEqual(
      u,
      { seconds: 0, spawns: 0, exports: 0, peak: 0, generators: {} },
      "a fresh account must read zeroes, not mock data",
    );
  });

  it("a replayed flush with the same/lower seq does not double-count; a higher seq applies (Req 3.3)", async () => {
    const userId = "usage-idempotent-user";

    // First flush at seq 5 applies against an empty account.
    const first = await server.mergeAccountUsage(userId, delta({ seconds: 100, spawns: 40 }), 5);
    assert.equal(first.seconds, 100);
    assert.equal(first.spawns, 40);

    // Replay the SAME seq (5): a stale flush must be a no-op — totals unchanged.
    const replaySame = await server.mergeAccountUsage(userId, delta({ seconds: 100, spawns: 40 }), 5);
    assert.equal(replaySame.seconds, 100, "same-seq replay must not double-count seconds");
    assert.equal(replaySame.spawns, 40, "same-seq replay must not double-count spawns");

    // A LOWER seq (3) is also stale and must be ignored.
    const replayLower = await server.mergeAccountUsage(userId, delta({ seconds: 999, spawns: 999 }), 3);
    assert.equal(replayLower.seconds, 100, "lower-seq flush must not apply");
    assert.equal(replayLower.spawns, 40, "lower-seq flush must not apply");

    // A strictly-higher seq (6) applies and accumulates on top of the totals.
    const advance = await server.mergeAccountUsage(userId, delta({ seconds: 20, spawns: 5 }), 6);
    assert.equal(advance.seconds, 120, "higher-seq flush must accumulate seconds");
    assert.equal(advance.spawns, 45, "higher-seq flush must accumulate spawns");

    // Persistence: a fresh read reflects the accumulated, non-double-counted totals.
    const persisted = await server.readAccountUsage(userId);
    assert.equal(persisted.seconds, 120);
    assert.equal(persisted.spawns, 45);
  });

  it("peak is the max of stored and incoming, and never regresses on a smaller delta (Req 3.2)", async () => {
    const userId = "usage-peak-user";

    // Establish a peak of 1000 at seq 1.
    const a = await server.mergeAccountUsage(userId, delta({ peak: 1000 }), 1);
    assert.equal(a.peak, 1000);

    // A higher incoming peak (5000) at seq 2 raises the stored peak to the max.
    const b = await server.mergeAccountUsage(userId, delta({ peak: 5000 }), 2);
    assert.equal(b.peak, 5000, "peak must rise to the larger incoming value");

    // A lower incoming peak (200) at seq 3 must NOT lower the stored peak — max wins.
    const c = await server.mergeAccountUsage(userId, delta({ peak: 200 }), 3);
    assert.equal(c.peak, 5000, "peak must stay at the max, never regress");

    const persisted = await server.readAccountUsage(userId);
    assert.equal(persisted.peak, 5000);
  });
});
