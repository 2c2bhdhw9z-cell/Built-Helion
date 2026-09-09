-- Batch B social/engagement: daily challenges (seed-of-the-day) and moderated
-- comments on public creations.
--
-- Every statement is ADDITIVE and IDEMPOTENT (`create table/index if not
-- exists`) so it applies cleanly and repeatably on both backends — Neon
-- (scripts/migrate.mjs) and PGLite (src/lib/db.ts) — and never rewrites or
-- drops an existing column. No seed/sample rows: empty tables are genuinely
-- empty. Never edits the existing 0001-0011 migrations.

-- Daily challenge / seed-of-the-day (Item 7). One row per calendar day.
-- `day` is the UTC date key (YYYY-MM-DD) and primary key so exactly one seed
-- exists per day; the server fn lazily inserts today's row from the pure
-- deterministic `seedForDate(day)` generator, so no cron is required. `config`
-- is the seed's CreationConfig as jsonb; `seed_creation_id` points at the real,
-- loadable public creation that entries fork from (its children — via the
-- batch-A `creations.parent_id` lineage — are the day's entries, ranked by
-- likes). `title` is an optional human label.
create table if not exists daily_challenges (
  day text not null primary key,
  title text not null default '',
  config jsonb not null,
  seed_creation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists daily_challenges_created_idx
  on daily_challenges (created_at desc);

-- Comments on PUBLIC creations (Item 9), mirroring the feedback moderation
-- shape. `hidden` is the soft-moderation flag: a hidden comment is excluded
-- from the public list but retained for admin review (admins can also hard
-- delete). No email/PII is stored — the author's display name is derived at
-- read time via a `profiles` join, never persisted here. Comments are only
-- ever created against public creations (enforced in the server layer, mirror
-- of the toggleLike public-only rule).
create table if not exists creation_comments (
  id text not null primary key,
  creation_id text not null,
  user_id text not null,
  body text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- Newest-first listing per creation, excluding hidden rows for the public path;
-- the index covers the creation_id filter + created_at ordering.
create index if not exists creation_comments_creation_idx
  on creation_comments (creation_id, created_at desc);
