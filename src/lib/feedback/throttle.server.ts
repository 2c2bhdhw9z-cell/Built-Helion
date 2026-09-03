/**
 * Server-only, in-memory per-key rate limiter for the PUBLIC submit path.
 *
 * This is a lightweight spam guard, not a security boundary: it lives in
 * process memory (per serverless instance) and resets on restart. That is
 * deliberately proportionate for a low-traffic lab app — it blunts a naive
 * flood without adding infra. For hard guarantees a shared store (e.g. the
 * database or a KV) or a captcha would be needed; documented in the feature
 * findings.
 */

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(message = "Too many requests") {
    super(message);
    this.name = "RateLimitError";
  }
}

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Sliding fixed-window limiter. Returns true when the call is allowed. */
export function allow(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/** Test-only: clear all buckets. */
export function resetBuckets(): void {
  buckets.clear();
}

/**
 * Resolve a best-effort client key from the current request (proxy-aware),
 * falling back to a shared bucket when no request/IP is available (SSR/build).
 */
export async function requestKey(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (!request) return "no-request";
    const h = request.headers;
    const fwd = h.get("x-forwarded-for");
    const ip = fwd?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
    return ip || "unknown-ip";
  } catch {
    return "no-request";
  }
}

/**
 * Throttle the current request under `key`-derived identity, throwing
 * `RateLimitError` when the per-window limit is exceeded.
 */
export async function throttleSubmit(): Promise<void> {
  const key = await requestKey();
  // 10 submissions per minute per client — generous for a human, hostile to a
  // scripted flood.
  if (!allow(`submit:${key}`, 10, 60_000)) {
    throw new RateLimitError("Too many feedback submissions — try again shortly.");
  }
}

/**
 * Throttle the PUBLIC upvote path. Voting is unauthenticated (no login), so
 * this per-IP window is the server-side guard against a scripted vote flood;
 * the client also tracks voted ids in platform KV as a best-effort
 * one-vote-per-item nicety. Neither is a hard guarantee (documented).
 */
export async function throttleVote(): Promise<void> {
  const key = await requestKey();
  // 30 votes per minute per client — comfortably above real human use.
  if (!allow(`vote:${key}`, 30, 60_000)) {
    throw new RateLimitError("Too many votes — try again shortly.");
  }
}
