-- Real team shelf, account usage, webhook deliveries, team history.
-- No seed rows. Empty tables are empty.

alter table version_history
  add column if not exists team_id text;

create index if not exists version_history_team_id_idx
  on version_history (team_id)
  where team_id is not null;

create table if not exists usage_stats (
  user_id text not null primary key,
  seconds integer not null default 0,
  spawns integer not null default 0,
  exports integer not null default 0,
  peak integer not null default 0,
  generators jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id text not null primary key,
  webhook_id text not null,
  user_id text not null,
  event text not null default '',
  ok boolean not null,
  status integer,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_user_idx
  on webhook_deliveries (user_id, created_at desc);
