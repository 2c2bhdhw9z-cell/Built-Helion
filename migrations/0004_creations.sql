-- Saved creations schema.
--
-- A "creation" is a named, shareable snapshot of the sim's CONFIG (the full
-- LabParams + generator/scene kind + particle count + speed) — never live
-- particle positions. Saving/listing/deleting go through the server functions
-- in src/lib/creations/ (getSql() -> Neon in prod, PGLite in preview) behind
-- authMiddleware, so every owner-scoped row is keyed to a verified user id.
-- The ONE exception is the public share read (getSharedCreationFn), which is
-- unauthenticated and returns a PII-free { id, name, config } projection so
-- anyone with the link can load and run a creation without signing in. This
-- file is the single source of truth for the table and applies to both
-- backends.
--
-- The id is an app-generated uuid (crypto.randomUUID) that doubles as the
-- unguessable public share token — there is no separate token column.
--
-- No seed/sample rows: an account with no saved creations resolves to a
-- genuinely empty list, never fabricated data.

create table if not exists creations (
  id text not null primary key,
  user_id text not null,
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creations_user_id_idx on creations (user_id);
