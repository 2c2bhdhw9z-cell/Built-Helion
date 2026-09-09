-- Preset forking / remixing lineage (Item 3).
--
-- Adds a nullable `parent_id` to `creations` recording the SOURCE creation a
-- remix was forked from. It references another creation's id (the app-generated
-- uuid share token) but is deliberately NOT a hard foreign key: the source may
-- later be deleted or unpublished, and a dangling lineage pointer must not block
-- that or orphan the remix. It is indexed so "children of X" style lookups and
-- lineage displays stay cheap.
--
-- Additive + idempotent (add column / create index IF NOT EXISTS), safe to run
-- on both the Neon (prod) and PGLite (preview/test) backends. Never edits the
-- existing 0004 migration.

alter table creations add column if not exists parent_id text;

create index if not exists creations_parent_id_idx on creations (parent_id);
