-- Batch C multiplayer (Item 13): DURABLE, NAMED rooms.
--
-- The live WebRTC presence layer (webrtc_peers / webrtc_signals in
-- signaling.server.ts) is intentionally EPHEMERAL — a peer row expires 30s
-- after its last poll and a room stops existing once everyone leaves. This
-- table is the separate, PERSISTENT naming/ownership layer keyed by the SAME
-- 6-char room `code`: it survives everyone leaving so a named room can be
-- re-entered later. It never touches the presence tables.
--
-- Every statement is ADDITIVE and IDEMPOTENT (`create table/index if not
-- exists`) so it applies cleanly and repeatably on both backends — Neon
-- (scripts/migrate.mjs) and PGLite (src/lib/db.ts) — and never rewrites or
-- drops an existing column. No seed rows. Never edits the existing 0001-0012
-- migrations.
create table if not exists rooms (
  code text not null primary key,
  name text not null default '',
  owner_id text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- Owner-scoped "your rooms" listing, most-recently-active first (listMyRooms).
create index if not exists rooms_owner_idx
  on rooms (owner_id, last_active_at desc);
