-- Batch 5: developer API usage rollup (Item 19) + time-series analytics rollup
-- for the admin dashboard DAU/WAU trends (Item 21).
--
-- Every statement is ADDITIVE and IDEMPOTENT (`create table/index if not
-- exists`) so it applies cleanly and repeatably on both backends — Neon
-- (scripts/migrate.mjs) and PGLite (src/lib/db.ts) — and never rewrites or
-- drops an existing object. No seed rows: empty tables are genuinely empty.

-- Per-user per-day API request rollup (Item 19). The durable rate limiter
-- (api_rate_limits, migration 0010) only holds the CURRENT fixed window, so it
-- cannot answer "how many API calls did this developer make over the last N
-- days". This table is a tiny counter the /api/v1 handler upserts once per
-- authenticated request: one row per (user_id, day), `count` incremented via
-- `on conflict (user_id, day) do update`. It powers the usage/quota chart on the
-- developer page. Owner-scoped everywhere it is read; aggregate count only, no
-- request bodies or PII stored.
create table if not exists api_usage_daily (
  user_id text not null,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

-- The developer page reads a single user's trailing N days, so an index on
-- (user_id, day desc) keeps that range scan cheap as history accumulates.
create index if not exists api_usage_daily_user_day_idx
  on api_usage_daily (user_id, day desc);

-- Nightly analytics rollup for the admin DAU/WAU trend (Item 21). There is no
-- cron runner in this deployment, so this is a LAZY-ON-VIEW rollup: when an
-- admin opens the dashboard, `rollupDay(day)` upserts one row per recent day
-- from the raw activity tables (`usage_stats.updated_at`,
-- `telemetry_samples.created_at`). One row per calendar day:
--   active_users — distinct accounts whose usage_stats.updated_at fell on `day`
--   samples      — telemetry_samples rows created on `day`
-- WAU is computed on read as the distinct active users over a trailing 7-day
-- window (directly from usage_stats.updated_at), not stored here. Aggregate
-- counts only — no per-user or identifying data (Req 12).
create table if not exists analytics_daily (
  day date not null primary key,
  active_users integer not null default 0,
  samples integer not null default 0,
  rolled_at timestamptz not null default now()
);

create index if not exists analytics_daily_day_idx on analytics_daily (day desc);
