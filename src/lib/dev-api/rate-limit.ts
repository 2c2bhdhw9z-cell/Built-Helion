import { allow } from "@/lib/feedback/throttle.server";
import { getSql } from "@/lib/db";

/**
 * Durable REST-API rate limiting (Req 11).
 *
 * The V1 API limiter must survive deploys and hold ACROSS serverless instances,
 * so the authoritative counter lives in Postgres (`api_rate_limits`) rather than
 * a per-process Map. Policy is unchanged: 60 requests per 60s per key
 * (`v1:<ip-or-user>`).
 *
 * FIXED-WINDOW COUNTER: each key gets one row per window bucket
 * (`window_start = floor(now / windowMs) * windowMs`). The check is a single
 * atomic upsert — `insert ... on conflict do update set count = count + 1
 * returning count` — so two concurrent requests (even on different instances)
 * each get a distinct, monotonic count back and cannot both slip past the limit.
 * When the window rolls over, a new bucket starts at 0.
 *
 * FAIL-OPEN with an in-memory fallback: if the database is unavailable we fall
 * back to the per-process in-memory limiter (`allow`) rather than hard-failing
 * all API traffic. A rate limiter is a throttle, not an auth boundary, so a DB
 * blip degrading it to per-instance throttling (or, in the worst momentary case,
 * allowing a request) is far safer than 500-ing every API call. This is the
 * documented, deliberate trade-off.
 */

export const V1_LIMIT = 60;
export const V1_WINDOW_MS = 60_000;

/**
 * The rate-limit key for an AUTHENTICATED principal. Both the enforcement path
 * (`handleV1` → `allowV1`) and the read-only quota peek the developer page shows
 * (`getUsageViewFn` → `readV1Quota`) MUST derive the key the same way, or the
 * number on the page would track a different bucket than the one that throttles
 * the account (the bug this centralization fixes). Unauthenticated requests are
 * still keyed by client IP (there is no user), handled at the call site.
 */
export function userRateLimitKey(userId: string): string {
  return `user:${userId}`;
}

/**
 * The last window bucket for which this process issued a GLOBAL stale-window
 * sweep. Throttles the global cleanup (below) to at most once per window per
 * instance so a hot path never fires a table-wide delete on every request. Held
 * on `globalThis` so dev HMR module reloads (which create a fresh module
 * instance) don't reset it and re-sweep on the next request.
 */
const globalSweep = globalThis as typeof globalThis & {
  __v1RateLimitSweptWindow__?: number;
};

/** The fixed-window bucket start (epoch ms) a timestamp falls into. */
export function windowStart(now: number, windowMs: number = V1_WINDOW_MS): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Pure fixed-window decision (no I/O) — unit-testable. Given the request COUNT
 * already recorded in the current window (the value the atomic upsert returned,
 * which includes this request), decide whether the request is allowed. The
 * count that first EXCEEDS `limit` is rejected; everything up to and including
 * `limit` passes.
 */
export function isWithinLimit(countIncludingThis: number, limit: number = V1_LIMIT): boolean {
  return countIncludingThis <= limit;
}

/**
 * The caller's CURRENT rate-limit window state for the usage/quota view (Item
 * 19) — a read-only peek that never increments the counter. Returns the request
 * count already recorded in the active window for `v1:<key>`, the policy limit,
 * and how many ms remain in the window. Best-effort: on a DB error (or an
 * un-migrated deploy) it reports an empty window rather than throwing.
 */
export async function readV1Quota(
  key: string,
  now: number = Date.now(),
): Promise<{ used: number; limit: number; windowMs: number; resetMs: number }> {
  const bucket = windowStart(now);
  const fullKey = `v1:${key}`;
  let used = 0;
  try {
    const sql = await getSql();
    const rows = await sql<{ count: number | string }>`
      select count from api_rate_limits where key = ${fullKey} and window_start = ${bucket}
    `;
    used = Number(rows[0]?.count ?? 0);
  } catch {
    used = 0;
  }
  return { used, limit: V1_LIMIT, windowMs: V1_WINDOW_MS, resetMs: bucket + V1_WINDOW_MS - now };
}

/**
 * Durable, race-safe rate check for the V1 API. Returns true when the request is
 * allowed. Falls back to the in-memory limiter if the DB round-trip fails
 * (fail-open, documented above).
 */
export async function allowV1(key: string, now: number = Date.now()): Promise<boolean> {
  const bucket = windowStart(now);
  const fullKey = `v1:${key}`;
  try {
    const sql = await getSql();
    const rows = await sql<{ count: number | string }>`
      insert into api_rate_limits (key, window_start, count)
      values (${fullKey}, ${bucket}, 1)
      on conflict (key, window_start)
      do update set count = api_rate_limits.count + 1
      returning count
    `;
    const count = Number(rows[0]?.count ?? 1);
    // Best-effort sweep of stale windows for this key so the table does not grow
    // unbounded. Fire-and-forget; a failure here must never affect the decision.
    void sql`
      delete from api_rate_limits where key = ${fullKey} and window_start < ${bucket}
    `.catch(() => undefined);
    // Best-effort GLOBAL sweep of expired windows. The per-key sweep above only
    // prunes buckets for keys that are actively hit, so keys that go quiet leave
    // their rows behind forever; this deletes every window older than the current
    // one regardless of key (covered by `api_rate_limits_window_idx` on
    // `window_start`, migration 0010). It is THROTTLED to at most once per window
    // per process (guarded by the last-swept bucket) so a hot path never issues a
    // table-wide delete on every request, and it is fire-and-forget so it can
    // never affect the rate-limit decision or add latency.
    if (globalSweep.__v1RateLimitSweptWindow__ !== bucket) {
      globalSweep.__v1RateLimitSweptWindow__ = bucket;
      void sql`
        delete from api_rate_limits where window_start < ${bucket}
      `.catch(() => undefined);
    }
    return isWithinLimit(count);
  } catch {
    // DB unavailable — degrade to the per-instance in-memory limiter rather than
    // failing the request outright.
    return allow(fullKey, V1_LIMIT, V1_WINDOW_MS, now);
  }
}
