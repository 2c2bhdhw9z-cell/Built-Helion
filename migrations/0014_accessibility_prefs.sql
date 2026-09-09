-- Accessibility preferences (Item 18).
--
-- Two additive, idempotent columns on the existing user_preferences table so a
-- signed-in user's accessibility choices survive across sessions/devices
-- (logged-out users keep these in localStorage only, same as the other prefs):
--
--   reduced_motion: 'system' | 'on' | 'off'. Default 'system' — defer to the
--     OS `prefers-reduced-motion` media query unless the user overrides it.
--   high_contrast:  boolean. Default false — the standard dark/light chrome
--     unless the user opts into the higher-contrast token set.
--
-- Reads/writes go through the server functions in src/lib/settings/ behind
-- authMiddleware (getSql() -> Neon in prod, PGLite in preview), so every row is
-- keyed to a verified user id. `add column if not exists` keeps this safe to
-- re-run against a table that already has the earlier columns.

alter table user_preferences
  add column if not exists reduced_motion text not null default 'system';

alter table user_preferences
  add column if not exists high_contrast boolean not null default false;
