-- Batch 3: durable REST rate limiting (Req 11) + admin analytics indexes (Req 12).
--
-- Every statement is ADDITIVE and IDEMPOTENT (`create table/index if not
-- exists`) so it applies cleanly and repeatably on both backends — Neon
-- (scripts/migrate.mjs) and PGLite (src/lib/db.ts) — and never rewrites or drops
-- an existing object. No seed rows: empty tables are genuinely empty.

-- Durable REST API rate limiting (Req 11). A fixed-window counter shared across
-- serverless instances and surviving deploys, replacing the per-process in-memory
-- Map. One row per (key, window bucket): `key` is the same `v1:<ip-or-user>` the
-- limiter uses, `window_start` is the epoch-ms start of the fixed window, and
-- `count` is the number of requests seen in that window. The atomic
-- upsert-and-return in src/lib/dev-api/rate-limit.ts increments and reads the
-- count in a single round-trip, so concurrent requests across instances cannot
-- race past the limit.
create table if not exists api_rate_limits (
  key text not null,
  window_start bigint not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- Sweeping expired windows is cheap and by (window_start); an index keeps the
-- best-effort cleanup (delete windows older than the current one) index-covered.
create index if not exists api_rate_limits_window_idx on api_rate_limits (window_start);

-- Admin dashboard analytics (Req 12). The "active users" metric filters
-- usage_stats by recency (updated_at >= now() - window), so an index on
-- updated_at keeps that scan cheap as the table grows. The device-tier and
-- particle-bucket breakdowns GROUP telemetry_samples by columns that already
-- exist (device_tier, particle_bucket); telemetry_samples is expected to stay
-- small enough that its group-by does not need a dedicated index.
create index if not exists usage_stats_updated_at_idx on usage_stats (updated_at);
