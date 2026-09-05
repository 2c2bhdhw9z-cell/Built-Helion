/**
 * Client-safe admin dashboard model (Reqs 5, 6). This file MUST stay free of any
 * server-only imports (no @/lib/db, no server.ts) so the browser bundle, the
 * admin UI, the client hooks, and the server functions can all import it.
 *
 * These are the projections the Admin_Service returns to an authorized admin —
 * every value is computed from stored rows (never seeded), so an empty store
 * yields genuinely empty/zero shapes rather than fabricated data.
 */

/**
 * One account row for the admin account list (Req 5.1): the Better Auth user id
 * and a display label, the per-user aggregate creation and like counts (likes
 * received on that user's public creations), and whether the account is
 * currently suspended (from `account_status`).
 */
export interface AdminAccount {
  id: string;
  displayName: string;
  creations: number;
  likes: number;
  suspended: boolean;
}

/**
 * The aggregate analytics view (Req 6): total account count, saved-creation
 * count, published (public) creation count, and total likes — each a
 * `count(*)`/`sum` over stored rows, `0` where no rows exist.
 */
export interface AdminAnalytics {
  accounts: number;
  savedCreations: number;
  publishedCreations: number;
  totalLikes: number;
}
