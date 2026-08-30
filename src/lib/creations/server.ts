import { getSql } from "@/lib/db";
import {
  normalizeCreationConfig,
  type CreationConfig,
  type CreationRow,
  type PublicCreation,
} from "./types.ts";

/**
 * Server-only DB access layer for saved creations. Imports getSql() (which
 * throws in the browser), so this module must NEVER be imported by client code
 * — the server functions in functions.ts import it dynamically inside their
 * handlers.
 *
 * All queries are parameterized via the sql tagged template. No mock/seeded
 * data: every row here comes from a real save. Owner-scoped reads/writes are
 * keyed to a verified user id; the ONE public read (getPublicCreation) returns
 * a PII-free { id, name, config } projection only.
 *
 * The `config` column is `jsonb`. Both drivers (pg + PGLite) parse a jsonb
 * value back into a JS object on read, and accept a JSON string on write — so
 * we JSON.stringify on insert and re-validate on read via
 * normalizeCreationConfig (never trusting the stored blob).
 */

/** Shape of a raw creations row before config is normalized. */
type RawCreationRow = {
  id: string;
  user_id: string;
  name: string;
  config: unknown;
  created_at: string | Date;
};

/** Coerce a raw DB row (config is untrusted jsonb) into a valid CreationRow. */
function toCreationRow(row: RawCreationRow): CreationRow {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    // The stored blob is treated as untrusted: normalize back to a complete,
    // valid config, falling back to defaults if it is somehow garbage.
    config: normalizeCreationConfig(row.config) ?? normalizeCreationConfig({})!,
    created_at: row.created_at,
  };
}

/**
 * Insert a new creation (id generated app-side, doubling as the share token)
 * for `userId` and return the persisted row.
 */
export async function insertCreation(
  userId: string,
  name: string,
  config: CreationConfig,
): Promise<CreationRow> {
  const sql = await getSql();
  const id = crypto.randomUUID();
  const rows = await sql<RawCreationRow>`
    insert into creations (id, user_id, name, config)
    values (${id}, ${userId}, ${name}, ${JSON.stringify(config)})
    returning id, user_id, name, config, created_at
  `;
  return toCreationRow(rows[0]);
}

/** All creations owned by `userId`, newest first. */
export async function listCreations(userId: string): Promise<CreationRow[]> {
  const sql = await getSql();
  const rows = await sql<RawCreationRow>`
    select id, user_id, name, config, created_at
    from creations
    where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map(toCreationRow);
}

/**
 * Delete a creation the caller owns. Ownership is enforced in the WHERE clause
 * (id AND user_id) so a user can never delete another user's creation. Returns
 * whether a row was actually deleted.
 */
export async function deleteCreation(
  userId: string,
  id: string,
): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from creations
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/**
 * The PUBLIC projection of a creation for the share link — { id, name, config }
 * ONLY, never user_id/PII. Returns null when the id (share token) is unknown.
 * This is the ONE unauthenticated read: anyone with the link can load and run
 * the creation without signing in.
 */
export async function getPublicCreation(
  id: string,
): Promise<PublicCreation | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string; config: unknown }>`
    select id, name, config
    from creations
    where id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    config: normalizeCreationConfig(row.config) ?? normalizeCreationConfig({})!,
  };
}
