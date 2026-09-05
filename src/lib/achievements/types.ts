/**
 * Client-safe achievements model. This file MUST stay free of any server-only
 * imports (no @/lib/db, no server.ts side effects) so the browser bundle, the
 * achievements UI, the client hook (use-achievements.ts), and the server
 * functions can all import it.
 *
 * An "achievement" is a durable, account-scoped milestone (e.g. "1M particles",
 * "24-hour cumulative session"). Definitions live in the static ACHIEVEMENTS
 * table in server.ts; a granted achievement is what the account has earned.
 */

/**
 * A single achievement definition: a stable `id`, a human-readable `label`, the
 * account `metric` its threshold is compared against, and the `threshold` the
 * metric must first meet to earn it.
 *
 * - `metric: "peak"` compares against the account's peak particle count.
 * - `metric: "seconds"` compares against the account's cumulative session
 *   seconds.
 */
export interface AchievementDef {
  id: string;
  label: string;
  metric: "peak" | "seconds";
  threshold: number;
}

/**
 * An achievement that has been granted to an account. `grantedAt` follows the
 * same `timestamptz` → `string | Date` contract as other stored timestamps: a
 * JS `Date` on the server and an ISO `string` once serialized to the client.
 */
export interface GrantedAchievement {
  id: string;
  grantedAt: string | Date;
}
