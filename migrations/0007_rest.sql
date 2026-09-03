-- Remaining plan: audit log, cloud checkpoints, API command queue.

create table if not exists audit_logs (
  id text not null primary key,
  user_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_id_idx on audit_logs (user_id, created_at desc);

create table if not exists version_history (
  id text not null primary key,
  user_id text not null,
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists version_history_user_id_idx on version_history (user_id, created_at desc);

create table if not exists api_commands (
  id text not null primary key,
  user_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists api_commands_pending_idx
  on api_commands (user_id, created_at)
  where consumed_at is null;
