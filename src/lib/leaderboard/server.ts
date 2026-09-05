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
