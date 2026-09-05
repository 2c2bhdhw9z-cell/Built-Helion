import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fc from "fast-check";
import type { LeaderboardEntry } from "./types.ts";

// server.ts imports `@/lib/db` (getSql) for the DB-backed `listLeaderboard`.
// The pure `rankRows` helper and the `MAX_LEADERBOARD_ENTRIES` constant do NO
// I/O — getSql() is only called inside `listLeaderboard`, never at module load.
// But the `@/` alias in server.ts only resolves once the loader hook below is
// registered, and a static top-level `import` would be hoisted and resolved
// BEFORE register() runs. So (exactly like the sibling suites do for server.ts)
// we register the loader and import server.ts dynamically inside a before()
// hook. No DB is ever initialized by this suite — we only touch pure exports.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type LeaderboardServer = typeof import("./server.ts");
interface LeaderboardRow {
  userId: string;
  displayName?: string | null;
  score: number;
}

let rankRows: (rows: readonly LeaderboardRow[]) => LeaderboardEntry[];
let MAX_LEADERBOARD_ENTRIES: number;

before(async () => {
  const server: LeaderboardServer = await import("./server.ts");
  rankRows = server.rankRows;
  MAX_LEADERBOARD_ENTRIES = server.MAX_LEADERBOARD_ENTRIES;
});

// A generator for raw score rows. userIds are drawn from a SMALL alphabet so
// duplicate userIds and — crucially — equal scores occur often, exercising the
// tie-break path. Scores are constrained to a small integer range for the same
// reason (many collisions => the stable-ordering property is meaningfully hit).
function rowsArb() {
  const rowArb = fc.record({
    userId: fc.string({ minLength: 1, maxLength: 4 }),
    displayName: fc.oneof(
      fc.constant(undefined),
      fc.constant(null),
      fc.string({ maxLength: 12 }),
    ),
    score: fc.integer({ min: 0, max: 20 }),
  });
  return fc.array(rowArb, { maxLength: 60 });
}

describe("rankRows — Property 5: leaderboard ordering is non-increasing and stable", () => {
  // Feature: helion-completion, Property 5: Leaderboard ordering is
  // non-increasing and stable — for any set of creator score rows, rankRows
  // returns entries ordered by score non-increasing, and any two equal-score
  // entries appear in the deterministic secondary order (userId ascending),
  // yielding a stable total order.
  // Validates: Requirements 7.1, 7.2
  it("orders by score non-increasing with userId-ascending stable ties (>=100 runs)", () => {
    fc.assert(
      fc.property(rowsArb(), (rows) => {
        const ranked = rankRows(rows);

        // Same number of entries, none dropped.
        assert.equal(ranked.length, rows.length);

        for (let i = 1; i < ranked.length; i++) {
          const prev = ranked[i - 1];
          const cur = ranked[i];

          // 1. Score is non-increasing (highest first).
          assert.ok(
            prev.score >= cur.score,
            `score must be non-increasing: ${prev.score} then ${cur.score}`,
          );

          // 2. On an equal-score tie, userId is strictly ascending — a
          //    deterministic total order (never equal, since a duplicate
          //    userId+score would still be ordered, and adjacent equal userIds
          //    with equal score are allowed only if identical rows exist; the
          //    sort is stable so ties are broken by userId ascending).
          if (prev.score === cur.score) {
            assert.ok(
              prev.userId <= cur.userId,
              `equal scores must be userId-ascending: ${prev.userId} then ${cur.userId}`,
            );
          }
        }

        // 3. 1-based ranks reflect position exactly.
        ranked.forEach((entry, index) => {
          assert.equal(entry.rank, index + 1);
        });
      }),
      { numRuns: 200 },
    );
  });

  it("is a stable total order — a fixed input always yields the same ordering (>=100 runs)", () => {
    fc.assert(
      fc.property(rowsArb(), (rows) => {
        const a = rankRows(rows);
        const b = rankRows(rows);
        // Deterministic: identical inputs => identical ordering + ranks.
        assert.deepEqual(a, b);
        // The result is independent of the INPUT order: shuffling the rows
        // must not change the ranked output (the userId tiebreak makes the
        // total order fully determined by the row set, not insertion order).
        const shuffled = [...rows].reverse();
        assert.deepEqual(rankRows(shuffled), a);
      }),
      { numRuns: 200 },
    );
  });

  it("does not mutate its input", () => {
    const rows: LeaderboardRow[] = [
      { userId: "b", score: 1 },
      { userId: "a", score: 1 },
    ];
    const snapshot = JSON.parse(JSON.stringify(rows));
    rankRows(rows);
    assert.deepEqual(rows, snapshot);
  });
});

describe("rankRows + slice — Property 6: leaderboard respects the maximum size", () => {
  // Feature: helion-completion, Property 6: Leaderboard respects the maximum
  // size — for any set of creator score rows and any configured maximum, the
  // returned board (after the listLeaderboard clamp/slice logic) contains at
  // most that maximum number of entries.
  // Validates: Requirements 7.4
  //
  // rankRows itself does not slice; listLeaderboard applies `.slice(0, max)`
  // where `max` is a requested limit clamped into 1..MAX_LEADERBOARD_ENTRIES.
  // We reproduce that clamp+slice here and assert the size-limit property, and
  // separately assert that MAX_LEADERBOARD_ENTRIES is itself a hard ceiling.

  // Mirror of server.ts clampLimit: default to the max, floor fractions, and
  // clamp into 1..MAX_LEADERBOARD_ENTRIES.
  function clampLimit(limit: number | undefined, max: number): number {
    if (typeof limit !== "number" || !Number.isFinite(limit)) return max;
    const floored = Math.floor(limit);
    if (floored < 1) return 1;
    if (floored > max) return max;
    return floored;
  }

  it("clamp+slice yields at most the configured maximum (>=100 runs)", () => {
    fc.assert(
      fc.property(
        rowsArb(),
        fc.oneof(
          fc.constant(undefined),
          fc.double({ min: -50, max: 500, noNaN: true }),
        ),
        (rows, requested) => {
          const ranked = rankRows(rows);
          const max = clampLimit(requested, MAX_LEADERBOARD_ENTRIES);
          const board = ranked.slice(0, max);

          // Never exceeds the clamped request...
          assert.ok(board.length <= max, `board ${board.length} > max ${max}`);
          // ...and never exceeds the hard ceiling regardless of the request.
          assert.ok(
            board.length <= MAX_LEADERBOARD_ENTRIES,
            `board ${board.length} > ceiling ${MAX_LEADERBOARD_ENTRIES}`,
          );
          // The clamp keeps the effective limit within [1, MAX].
          assert.ok(max >= 1 && max <= MAX_LEADERBOARD_ENTRIES);
          // The board is a prefix of the full ranking (order preserved).
          assert.deepEqual(board, ranked.slice(0, board.length));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("a full ranking (no explicit slice) never exceeds MAX_LEADERBOARD_ENTRIES rows when sliced to the ceiling (>=100 runs)", () => {
    // Generate potentially-large row sets and confirm the ceiling holds.
    const manyRowsArb = fc.array(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 6 }),
        score: fc.integer({ min: 0, max: 1000 }),
      }),
      { maxLength: 250 },
    );
    fc.assert(
      fc.property(manyRowsArb, (rows) => {
        const board = rankRows(rows).slice(0, MAX_LEADERBOARD_ENTRIES);
        assert.ok(board.length <= MAX_LEADERBOARD_ENTRIES);
        assert.equal(board.length, Math.min(rows.length, MAX_LEADERBOARD_ENTRIES));
      }),
      { numRuns: 200 },
    );
  });
});
