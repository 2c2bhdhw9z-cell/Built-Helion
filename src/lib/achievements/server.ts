import type { AchievementDef } from "./types.ts";

/**
 * The Achievement_Service data layer.
 *
 * This module currently exposes the static achievement definition table and the
 * PURE first-crossing evaluator. The DB-backed `grantIfEarned` / `listAchievements`
 * functions land in a later task; only the pure logic and the definitions live
 * here for now so they can be unit- and property-tested without a database.
 */

/**
 * The static achievement definition table. Metrics map to the account totals
 * recorded on the usage-flush path:
 *
 * - `million`     — peak particle count first reaches 1,000,000 (the free 1M
 *                   cap milestone; Req 8.1).
 * - `day-session` — cumulative session time first reaches 24 hours, i.e.
 *                   86,400 seconds (Req 8.2).
 *
 * The design's example set names exactly these two milestones, so the table is
 * kept to that minimum rather than inventing thresholds the spec does not imply.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "million", label: "One Million Particles", metric: "peak", threshold: 1_000_000 },
  { id: "day-session", label: "24-Hour Session", metric: "seconds", threshold: 86_400 },
];

/**
 * Pure first-crossing achievement evaluator (Reqs 8.1, 8.2, 8.3; design
 * Property 7). Given the ids already granted to an account and the account's
 * current metric values, returns ONLY the ids that:
 *
 *   1. have their threshold met by the corresponding metric, AND
 *   2. are not already present in `current`.
 *
 * Already-granted achievements are never returned again and are never removed,
 * so re-running with the union of granted ids (and equal-or-higher metrics)
 * yields an empty array. No I/O — the DB layer is responsible for persisting the
 * returned ids.
 *
 * @param current  the achievement ids already granted to the account
 * @param metrics  the account's current `peak` and cumulative `seconds` values
 * @returns        the newly-qualifying achievement ids (may be empty)
 */
export function evaluateAchievements(
  current: string[],
  metrics: { peak: number; seconds: number },
): string[] {
  const granted = new Set(current);
  const newlyEarned: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (granted.has(def.id)) continue;
    const value = def.metric === "peak" ? metrics.peak : metrics.seconds;
    if (value >= def.threshold) {
      newlyEarned.push(def.id);
    }
  }
  return newlyEarned;
}
