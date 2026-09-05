import { getSql } from "@/lib/db";
import type { AchievementDef, GrantedAchievement } from "./types.ts";

/**
 * The Achievement_Service data layer.
 *
 * This module exposes the static achievement definition table, the PURE
 * first-crossing evaluator, and the DB-backed `grantIfEarned` /
 * `listAchievements` persistence functions.
 *
 * The pure parts (`ACHIEVEMENTS`, `evaluateAchievements`) carry no I/O so they
 * remain unit- and property-testable without a database; the DB functions use
 * the shared `getSql()` client and back onto the `achievements` table from
 * migration 0009 (composite primary key `(user_id, achievement_id)`, which
 * makes first-crossing grants idempotent via `on conflict do nothing`).
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


type RawAchievementRow = {
  achievement_id: string;
  granted_at: string | Date;
};

/**
 * Grant every achievement whose threshold the account's metrics have now first
 * crossed, then return the account's FULL granted set (Reqs 8.1-8.4).
 *
 * The flow is: read the ids already granted to the account, run the PURE
 * `evaluateAchievements` to find the newly-qualifying ids (first-crossing only),
 * and insert those rows. The insert uses `on conflict do nothing` against the
 * `(user_id, achievement_id)` composite primary key so a concurrent flush or a
 * re-run never double-grants and never errors (idempotent, Req 8.3). Finally the
 * complete granted set is read back and returned so the caller always sees the
 * authoritative state — including grants made by a racing request.
 *
 * @param userId   the account to grant against
 * @param metrics  the account's current `peak` and cumulative `seconds` values
 * @returns        every achievement granted to the account, newest first
 */
export async function grantIfEarned(
  userId: string,
  metrics: { peak: number; seconds: number },
): Promise<GrantedAchievement[]> {
  const sql = await getSql();
  const existing = await sql<{ achievement_id: string }>`
    select achievement_id from achievements where user_id = ${userId}
  `;
  const current = existing.map((r) => r.achievement_id);
  const newlyEarned = evaluateAchievements(current, metrics);

  for (const id of newlyEarned) {
    await sql`
      insert into achievements (user_id, achievement_id)
      values (${userId}, ${id})
      on conflict do nothing
    `;
  }

  return listAchievements(userId);
}

/**
 * Return every achievement granted to the account, newest first (Req 8.4).
 * Signed-out callers never reach this — the client hook returns an empty set
 * when signed out (Req 8.5) — so this always operates on a real account id.
 */
export async function listAchievements(userId: string): Promise<GrantedAchievement[]> {
  const sql = await getSql();
  const rows = await sql<RawAchievementRow>`
    select achievement_id, granted_at
    from achievements
    where user_id = ${userId}
    order by granted_at desc, achievement_id asc
  `;
  return rows.map((row) => ({ id: row.achievement_id, grantedAt: row.granted_at }));
}
