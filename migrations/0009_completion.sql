-- Helion Completion: additive schema for cloud-save reconciliation, the admin
-- dashboard, leaderboards/achievements, opt-in telemetry, and editorial curation.
--
-- Every statement here is ADDITIVE and IDEMPOTENT (`if not exists` /
-- `add column if not exists`) so it applies cleanly and repeatably on both
-- backends — Neon (scripts/migrate.mjs) and PGLite (src/lib/db.ts) — and never
-- rewrites or drops an existing column. No seed/sample rows: empty tables are
-- genuinely empty. Existing tables (creations, usage_stats) are extended in
-- place; creations.is_public/created_at (0004/0005) and usage_stats (0008) are
-- reused.

-- Curation: featured mark on public creations (Req 13). The partial index keeps
-- the curated-row query cheap by covering only rows that can ever appear in it.
alter table creations
  add column if not exists featured boolean not null default false;

create index if not exists creations_featured_idx
  on creations (created_at desc)
  where featured = true and is_public = true;

-- Suspended accounts (Req 5.2/5.3/5.4). A suspended account can still read but
-- every authenticated write rejects; the write gate reads this table.
create table if not exists account_status (
  user_id text not null primary key,
  suspended boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Server-recorded achievements (Req 8). One row per (account, achievement); the
-- composite primary key makes first-crossing grants idempotent via
-- `on conflict do nothing`.
create table if not exists achievements (
  user_id text not null,
  achievement_id text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists achievements_user_idx on achievements (user_id);

-- Idempotent usage flush guard (Req 3.3). The server applies a usage delta only
-- when its activity sequence exceeds this stored high-water mark, so replayed or
-- stale flushes are no-ops.
alter table usage_stats
  add column if not exists last_activity_seq bigint not null default 0;

-- Anonymous performance telemetry (Req 12) — NO user/email column by design.
-- The insert schema simply has no identity field, so a sample can never carry
-- an account id or email.
create table if not exists telemetry_samples (
  id text not null primary key,
  fps_avg real not null,
  frame_ms_p95 real not null,
  dropped_frames integer not null default 0,
  particle_bucket integer not null default 0,
  device_tier text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists telemetry_created_idx on telemetry_samples (created_at desc);
