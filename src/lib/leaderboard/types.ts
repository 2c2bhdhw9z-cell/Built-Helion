/**
 * Client-safe leaderboard model. This file MUST stay free of any server-only
 * imports (no @/lib/db, no server.ts) so the browser bundle, the leaderboard
 * UI, the public REST route, and the server functions can all import it.
 *
 * The Leaderboard_Service ranks creators by a metric computed from stored
 * public-creation and like rows (Req 7.3) and returns a global ordered board.
 */

/**
 * A single ranked leaderboard row.
 *
 * - `userId` — the creator's account id (also the deterministic secondary sort
 *   key that makes equal-score ties stable, Req 7.2).
 * - `displayName` — the creator's chosen display name (never an email).
 * - `score` — the ranking metric, computed from stored rows (Req 7.3).
 * - `rank` — the 1-based position in the returned, ordered board.
 */
export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  score: number;
  rank: number;
}
