import { getSql } from "@/lib/db";
import type { LeaderboardEntry } from "./types.ts";

/**
 * A raw creator score row, before ranking. `displayName` is optional because a
 * creator may not have set a name; `rankRows` falls back to "No name" (never an
 * email), matching the community-library author convention.
 */
export interface LeaderboardRow {
  userId: string;
  displayName?: string | null;
  score: number;
}

function authorLabel(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  return t || "No name";
}

/**
 * Rank raw creator score rows into an ordered leaderboard (Property 5 /
 * Reqs 7.1, 7.2).
 *
 * PURE — no I/O. Given raw `{ userId, displayName?, score }` rows this returns a
 * new array of {@link LeaderboardEntry} ordered by:
 *   1. `score` NON-INCREASING (highest first), then
 *   2. `userId` ASCENDING as a deterministic secondary key so equal-score ties
 *      always land in the same, stable order.
 *
 * Each returned entry is assigned a 1-based `rank` reflecting its position in
 * that ordering. The input array is not mutated.
 */
export function rankRows(rows: readonly LeaderboardRow[]): LeaderboardEntry[] {
  return [...rows]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    })
    .map((row, index) => ({
      userId: row.userId,
      displayName: authorLabel(row.displayName),
      score: row.score,
      rank: index + 1,
    }));
}


/**
 * The maximum number of ranked entries {@link listLeaderboard} will ever
 * return, and the default when the caller does not supply a limit (Req 7.4).
 * A requested `limit` is clamped into `1..MAX_LEADERBOARD_ENTRIES`.
 */
export const MAX_LEADERBOARD_ENTRIES = 100;

/**
 * Per-public-creation weight folded into a creator's score alongside their
 * total likes (Req 7.3). Likes dominate the ranking; publishing public work
 * contributes a small, deterministic amount so an active creator with no likes
 * yet still places above one with none.
 */
const PER_PUBLIC_CREATION_WEIGHT = 1;

/**
 * Clamp a requested `limit` into `1..MAX_LEADERBOARD_ENTRIES`, defaulting to the
 * maximum when unset / non-finite (Req 7.4). A fractional request floors so the
 * SQL `limit` is always a whole number.
 */
function clampLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return MAX_LEADERBOARD_ENTRIES;
  }
  const floored = Math.floor(limit);
  if (floored < 1) return 1;
  if (floored > MAX_LEADERBOARD_ENTRIES) return MAX_LEADERBOARD_ENTRIES;
  return floored;
}

/** A raw grouped score row as returned by the leaderboard aggregate query. */
type RawLeaderboardRow = {
  user_id: string;
  display_name: string | null;
  score: string | number;
};

/**
 * Build the global ranked leaderboard from stored public-creation and like rows
 * (Reqs 7.1, 7.2, 7.3, 7.4, 7.5).
 *
 * A single grouped query joins each creator's PUBLIC creations to their likes
 * and produces, per creator, `{ user_id, display_name, score }` where the score
 * is the total number of likes across that creator's public creations plus a
 * small {@link PER_PUBLIC_CREATION_WEIGHT} per public creation (Req 7.3). Only
 * public creations contribute — a creator with no public work never appears.
 *
 * The pure {@link rankRows} helper then orders the raw rows into a stable board
 * (score non-increasing, `userId` ascending tiebreak, Reqs 7.1/7.2) and the SQL
 * `limit` is clamped to {@link MAX_LEADERBOARD_ENTRIES} (Req 7.4). No auth is
 * required — signed-out viewers can read the board (Req 7.5).
 *
 * The like count is aggregated with a correlated subquery rather than a join to
 * `creation_likes` so each like is counted once even when a creator has several
 * public creations (a direct join would multiply likes by the creation count).
 */
export async function listLeaderboard(limit?: number): Promise<LeaderboardEntry[]> {
  const sql = await getSql();
  const max = clampLimit(limit);
  const rows = await sql<RawLeaderboardRow>`
    select
      c.user_id as user_id,
      coalesce(nullif(p.display_name, ''), '') as display_name,
      sum(
        ${PER_PUBLIC_CREATION_WEIGHT}
        + (select count(*) from creation_likes l where l.creation_id = c.id)
      ) as score
    from creations c
    left join profiles p on p.user_id = c.user_id
    where c.is_public = true
    group by c.user_id, p.display_name
  `;
  const ranked = rankRows(
    rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      score: typeof row.score === "number" ? row.score : Number(row.score) || 0,
    })),
  );
  return ranked.slice(0, max);
}
