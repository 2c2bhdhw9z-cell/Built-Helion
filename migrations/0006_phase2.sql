-- Phase 2 remainder: team libraries, API tokens, webhooks.
--
-- teams / team_members: a shared workspace keyed by a join code.
-- creations.team_id: optional; team library lists rows with this set.
-- api_tokens: hashed personal tokens for the REST API (raw token shown once).
-- webhooks: owner-scoped URLs fired on publish (best-effort, no retry queue).

create table if not exists teams (
  id text not null primary key,
  name text not null,
  join_code text not null unique,
  owner_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists teams_owner_id_idx on teams (owner_id);
create index if not exists teams_join_code_idx on teams (join_code);

create table if not exists team_members (
  team_id text not null,
  user_id text not null,
  role text not null default 'edit',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_id_idx on team_members (user_id);

alter table creations
  add column if not exists team_id text;

create index if not exists creations_team_id_idx
  on creations (team_id)
  where team_id is not null;

create table if not exists api_tokens (
  id text not null primary key,
  user_id text not null,
  name text not null,
  prefix text not null,
  hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists api_tokens_user_id_idx on api_tokens (user_id);

create table if not exists webhooks (
  id text not null primary key,
  user_id text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists webhooks_user_id_idx on webhooks (user_id);
