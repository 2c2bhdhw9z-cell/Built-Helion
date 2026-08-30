-- User preferences schema.
--
-- Per-account preferences that must survive across sessions/devices for a
-- signed-in user (logged-out users keep preferences in localStorage only, so
-- they never touch this table). Reads/writes go through the server functions in
-- src/lib/settings/ (getSql() -> Neon in prod, PGLite in preview) behind
-- authMiddleware, so every row is keyed to a verified user id. This file is the
-- single source of truth for the table and applies to both backends.
--
-- No seed/sample rows: an unknown user resolves to the client-safe default
-- (autofill_feedback_email = false), never fabricated data.

create table if not exists user_preferences (
  user_id text not null primary key,
  autofill_feedback_email boolean not null default false,
  updated_at timestamptz not null default now()
);
