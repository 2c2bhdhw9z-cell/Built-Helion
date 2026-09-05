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
