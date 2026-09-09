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

/** One `{ label, count }` slice of a breakdown chart (device tier, generator,
 * particle bucket). `label` is always a non-identifying, aggregate value. */
export interface AdminBreakdownSlice {
  label: string;
  count: number;
}

/**
 * The richer dashboard analytics view (Req 12), all AGGREGATE — never PII.
 * Sourced from the data already collected server-side:
 *   - `activeUsers` — accounts with a usage_stats row touched within the recent
 *     activity window (see ACTIVE_WINDOW_DAYS).
 *   - `popularGenerators` — the most-used generator kinds, summed across every
 *     account's `usage_stats.generators` map (descending by use count).
 *   - `deviceTiers` — the device/GPU-tier breakdown from opt-in telemetry
 *     (`telemetry_samples.device_tier`), descending by sample count.
 *   - `particleBuckets` — the coarse particle-count bucket breakdown from
 *     telemetry, ascending by bucket so the chart reads low→high.
 *   - `telemetrySamples` — the total telemetry sample count the breakdowns were
 *     computed from (0 when telemetry is empty).
 */
export interface AdminDashboardAnalytics {
  activeUsers: number;
  popularGenerators: AdminBreakdownSlice[];
  deviceTiers: AdminBreakdownSlice[];
  particleBuckets: AdminBreakdownSlice[];
  telemetrySamples: number;
}

/**
 * One day's point on the DAU/WAU time-series trend (Item 21), all AGGREGATE —
 * never PII. `day` is a 'YYYY-MM-DD' string.
 *   - `dau`     — daily active users: distinct accounts whose usage_stats
 *     `updated_at` fell on that calendar day.
 *   - `wau`     — weekly active users: distinct accounts active over the
 *     trailing 7-day window ending on that day.
 *   - `samples` — telemetry samples created on that day.
 */
export interface AdminTrendPoint {
  day: string;
  dau: number;
  wau: number;
  samples: number;
}

/**
 * The DAU/WAU trend view (Item 21): a rolled-up point per day over the trailing
 * window. Rollup rows (`analytics_daily`) are computed lazily-on-view — there is
 * no cron runner — via `rollupDay`, which is idempotent (upsert on the day PK).
 * WAU is derived on read from the raw activity so it is always exact for the
 * window even before older days have been rolled up.
 */
export interface AdminTrend {
  points: AdminTrendPoint[];
}
