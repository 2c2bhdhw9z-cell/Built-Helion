-- Phase 1 remaining: public library, likes, profiles, plans, theme.
--
-- creations.is_public: owner-published rows appear in the community library.
-- Unlisted rows stay reachable only via the unguessable share id.
--
-- creation_likes: one like per (user, creation). Counts are computed, not stored.
--
-- profiles: display name / bio / avatar hue. No email. Missing row = defaults.
--
-- subscriptions: plan + optional 7-day Pro trial. Entitlement is computed in
-- app code (plan in {pro,enterprise} OR trial_ends_at in the future).
--
-- user_preferences.theme: 'dark' | 'light'. Default dark.

alter table creations
  add column if not exists is_public boolean not null default false;

create index if not exists creations_public_created_idx
  on creations (created_at desc)
  where is_public = true;

create table if not exists creation_likes (
  user_id text not null,
  creation_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, creation_id)
);

create index if not exists creation_likes_creation_id_idx
  on creation_likes (creation_id);

create table if not exists profiles (
  user_id text not null primary key,
  display_name text not null default '',
  bio text not null default '',
  hue integer not null default 168,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  user_id text not null primary key,
  plan text not null default 'free',
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_preferences
  add column if not exists theme text not null default 'dark';
