import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fc from "fast-check";
import type { AchievementDef } from "./types.ts";

// server.ts exposes the pure `ACHIEVEMENTS` / `evaluateAchievements` this suite
// exercises, but it now also imports `@/lib/db` for the DB-backed grant layer
// (task 6.6). The `@/` alias only resolves once the PGLite glob loader hook is
// registered, so — matching creations.test.ts — we register the hook and import
// server.ts dynamically inside a before() hook (a static import would be hoisted
// and resolved before register() runs). This stays a pure-logic property test:
// merely importing the module opens no database and the DB functions are never
// called here.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

let ACHIEVEMENTS: AchievementDef[];
let evaluateAchievements: (
  current: string[],
  metrics: { peak: number; seconds: number },
) => string[];
let ALL_IDS: string[];

before(async () => {
  const server = await import("./server.ts");
  ACHIEVEMENTS = server.ACHIEVEMENTS;
  evaluateAchievements = server.evaluateAchievements;
  // Every achievement id defined in the static table.
  ALL_IDS = ACHIEVEMENTS.map((def) => def.id);
});

/**
 * Reference oracle, computed independently of the implementation: the ids whose
 * threshold the metrics meet AND that are not already granted. This is the
 * exact set Property 7 says `evaluateAchievements` must return.
 */
function expectedNewGrants(
  granted: Set<string>,
  metrics: { peak: number; seconds: number },
): string[] {
  return ACHIEVEMENTS.filter((def) => {
    if (granted.has(def.id)) return false;
    const value = def.metric === "peak" ? metrics.peak : metrics.seconds;
    return value >= def.threshold;
  }).map((def) => def.id);
}

// Feature: helion-completion, Property 7: Achievement evaluation grants on first
// crossing and is idempotent — for any already-granted set and any metric
// values, evaluateAchievements returns exactly the achievement ids whose
// thresholds the metrics meet AND that are not already granted; re-running with
// the union of granted ids and the same-or-higher metrics returns an empty
// new-grant set (already-granted are never re-granted and never removed).
// **Validates: Requirements 8.1, 8.2, 8.3**
describe("evaluateAchievements — Property 7 (fast-check, >=100 runs)", () => {
  // Generators constrained to the meaningful input space: metrics are
  // non-negative finite numbers spanning well below and well above both
  // thresholds (1,000,000 peak and 86,400 seconds), and the already-granted set
  // is any subset of the real achievement ids (plus occasional unknown ids the
  // evaluator must simply ignore).
  const metric = fc.oneof(
    fc.integer({ min: 0, max: 5_000_000 }),
    fc.constantFrom(0, 1, 999_999, 1_000_000, 1_000_001, 86_399, 86_400, 86_401),
  );
  const metricsArb = fc.record({ peak: metric, seconds: metric });
  // `ALL_IDS` is populated in the before() hook, so build the id-dependent
  // arbitrary lazily (inside each test body) rather than at describe-collection
  // time when it is still undefined.
  const grantedArb = () =>
    fc.uniqueArray(
      fc.oneof(fc.constantFrom(...ALL_IDS), fc.constantFrom("ghost", "legacy-id")),
    );

  it("grants exactly the not-yet-granted ids whose thresholds are met", () => {
    fc.assert(
      fc.property(grantedArb(), metricsArb, (granted, metrics) => {
        const grantedSet = new Set(granted);
        const result = evaluateAchievements(granted, metrics);
        const expected = expectedNewGrants(grantedSet, metrics);

        // Order-independent set equality against the independent oracle.
        assert.deepEqual([...result].sort(), [...expected].sort());

        // No already-granted id is ever returned (never re-granted).
        for (const id of result) {
          assert.equal(grantedSet.has(id), false, `re-granted already-held ${id}`);
          // Every returned id is a real achievement whose threshold is met.
          const def = ACHIEVEMENTS.find((d) => d.id === id)!;
          assert.ok(def, `returned unknown id ${id}`);
          const value = def.metric === "peak" ? metrics.peak : metrics.seconds;
          assert.ok(value >= def.threshold, `returned ${id} below threshold`);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("is idempotent: re-running with the union and equal-or-higher metrics yields no new grants", () => {
    const higher = fc.record({
      peak: fc.integer({ min: 0, max: 5_000_000 }),
      seconds: fc.integer({ min: 0, max: 5_000_000 }),
    });
    fc.assert(
      fc.property(grantedArb(), metricsArb, higher, (granted, metrics, bump) => {
        // Same or strictly higher metrics — idempotence is about re-running at
        // an equal-or-higher metric level, so the first pass is evaluated at the
        // higher metrics too. (Grants earned only at the lower metrics are a
        // subset of those earned at the higher ones, since thresholds are
        // monotonic in the metric value.)
        const higherMetrics = {
          peak: metrics.peak + bump.peak,
          seconds: metrics.seconds + bump.seconds,
        };

        const first = evaluateAchievements(granted, higherMetrics);

        // Union of previously-granted ids and everything newly earned at the
        // higher metrics.
        const union = [...new Set([...granted, ...first])];

        // Re-running over that union with the SAME (equal-or-higher) metrics
        // must grant nothing new (already-granted are never re-granted).
        const second = evaluateAchievements(union, higherMetrics);
        assert.deepEqual(second, [], "re-run over the union must grant nothing new");

        // Already-granted are never removed: the union still contains every id
        // that was granted before, and the evaluator did not touch it.
        for (const id of granted) {
          assert.ok(union.includes(id), `previously-granted ${id} was dropped`);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// Example-based boundary cases the design calls out explicitly: the 1,000,000
// peak `million` achievement and the 86,400-second `day-session` achievement,
// each tested at, just below, and just above the threshold.
// **Validates: Requirements 8.1, 8.2, 8.3**
describe("evaluateAchievements — exact 1M and 24-hour boundary cases", () => {
  it("million (peak 1,000,000): granted AT and ABOVE, not below", () => {
    // Just below → not granted.
    assert.deepEqual(evaluateAchievements([], { peak: 999_999, seconds: 0 }), []);
    // Exactly AT the threshold → granted (first crossing, Req 8.1).
    assert.deepEqual(evaluateAchievements([], { peak: 1_000_000, seconds: 0 }), ["million"]);
    // Just above → granted.
    assert.deepEqual(evaluateAchievements([], { peak: 1_000_001, seconds: 0 }), ["million"]);
  });

  it("day-session (86,400 seconds): granted AT and ABOVE, not below", () => {
    // Just below → not granted.
    assert.deepEqual(evaluateAchievements([], { peak: 0, seconds: 86_399 }), []);
    // Exactly AT the threshold → granted (24-hour cumulative session, Req 8.2).
    assert.deepEqual(evaluateAchievements([], { peak: 0, seconds: 86_400 }), ["day-session"]);
    // Just above → granted.
    assert.deepEqual(evaluateAchievements([], { peak: 0, seconds: 86_401 }), ["day-session"]);
  });

  it("both thresholds met at once grants both ids", () => {
    assert.deepEqual(
      evaluateAchievements([], { peak: 1_000_000, seconds: 86_400 }).sort(),
      ["day-session", "million"],
    );
  });

  it("does not re-grant a boundary achievement already held (idempotent at the boundary)", () => {
    // `million` already granted, peak exactly at threshold again → no new grant.
    assert.deepEqual(
      evaluateAchievements(["million"], { peak: 1_000_000, seconds: 0 }),
      [],
    );
    // With day-session now also crossed, only the not-yet-held id is returned.
    assert.deepEqual(
      evaluateAchievements(["million"], { peak: 2_000_000, seconds: 86_400 }),
      ["day-session"],
    );
  });
});
