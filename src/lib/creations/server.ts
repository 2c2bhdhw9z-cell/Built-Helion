import { getSql } from "@/lib/db";
import {
  normalizeCreationConfig,
  type CreationConfig,
  type CreationRow,
  type LibraryItem,
  type PublicCreation,
} from "./types.ts";

type RawCreationRow = {
  id: string;
  user_id: string;
  name: string;
  config: unknown;
  created_at: string | Date;
  is_public?: boolean | number | string;
};

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

function authorLabel(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  return t || "No name";
}

function toCreationRow(row: RawCreationRow): CreationRow | null {
  const config = normalizeCreationConfig(row.config);
  if (!config) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    config,
    created_at: row.created_at,
    is_public: asBool(row.is_public),
  };
}

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
    returning id, user_id, name, config, created_at, is_public
  `;
  try {
    const { writeAudit } = await import("@/lib/audit/server");
    void writeAudit(userId, "creation.save", name);
  } catch {
    /* audit is best-effort */
  }
  const saved = toCreationRow(rows[0]);
  if (!saved) throw new Error("Could not save");
  return saved;
}

export async function listCreations(userId: string): Promise<CreationRow[]> {
  const sql = await getSql();
  const rows = await sql<RawCreationRow>`
    select id, user_id, name, config, created_at, is_public
    from creations
    where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map(toCreationRow).filter((row): row is CreationRow => row !== null);
}

export async function deleteCreation(userId: string, id: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from creations
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

export async function setCreationPublic(
  userId: string,
  id: string,
  isPublic: boolean,
): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update creations
    set is_public = ${isPublic}, updated_at = now()
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  if (rows.length > 0 && isPublic) {
    try {
      const { fireWebhooks } = await import("@/lib/dev-api/tokens");
      void fireWebhooks(userId, { event: "creation.published", id, public: true });
      const { writeAudit } = await import("@/lib/audit/server");
      void writeAudit(userId, "creation.publish", id);
    } catch {
      /* webhooks are best-effort */
    }
  }
  return rows.length > 0;
}

export async function getPublicCreation(id: string): Promise<PublicCreation | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string; config: unknown }>`
    select id, name, config
    from creations
    where id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  const config = normalizeCreationConfig(row.config);
  if (!config) return null;
  return {
    id: row.id,
    name: row.name,
    config,
  };
}

export async function getOwnedCreation(userId: string, id: string): Promise<PublicCreation | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string; config: unknown }>`
    select id, name, config from creations where id = ${id} and user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  const config = normalizeCreationConfig(row.config);
  if (!config) return null;
  return { id: row.id, name: row.name, config };
}

type LibraryRow = {
  id: string;
  name: string;
  config: unknown;
  created_at: string | Date;
  author: string | null;
  like_count: string | number;
  liked: boolean | number | string | null;
};

function toLibraryItem(row: LibraryRow, likedIds: Set<string>): LibraryItem | null {
  const likeCount = typeof row.like_count === "number" ? row.like_count : Number(row.like_count) || 0;
  const config = normalizeCreationConfig(row.config);
  if (!config) return null;
  return {
    id: row.id,
    name: row.name,
    config,
    created_at: row.created_at,
    author: authorLabel(row.author),
    likeCount,
    liked: likedIds.has(row.id) || asBool(row.liked),
  };
}

/**
 * Public community feed. `viewerId` is optional so signed-out visitors can
 * browse; likes they own are only marked when a viewer id is supplied.
 */
export async function listLibrary(
  sort: "recent" | "featured",
  viewerId: string | null,
): Promise<LibraryItem[]> {
  const sql = await getSql();
  const rows =
    sort === "featured"
      ? await sql<LibraryRow>`
          select c.id, c.name, c.config, c.created_at,
            coalesce(nullif(p.display_name, ''), '') as author,
            (select count(*) from creation_likes l where l.creation_id = c.id) as like_count
          from creations c
          left join profiles p on p.user_id = c.user_id
          where c.is_public = true
          order by like_count desc, c.created_at desc
          limit 48
        `
      : await sql<LibraryRow>`
          select c.id, c.name, c.config, c.created_at,
            coalesce(nullif(p.display_name, ''), '') as author,
            (select count(*) from creation_likes l where l.creation_id = c.id) as like_count
          from creations c
          left join profiles p on p.user_id = c.user_id
          where c.is_public = true
          order by c.created_at desc
          limit 48
        `;
  let likedIds = new Set<string>();
  if (viewerId) {
    const liked = await sql<{ creation_id: string }>`
      select creation_id from creation_likes where user_id = ${viewerId}
    `;
    likedIds = new Set(liked.map((r) => r.creation_id));
  }
  return rows
    .map((row) => toLibraryItem(row, likedIds))
    .filter((row): row is LibraryItem => row !== null);
}

export async function toggleLike(
  userId: string,
  creationId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const sql = await getSql();
  const exists = await sql<{ creation_id: string }>`
    select creation_id from creation_likes
    where user_id = ${userId} and creation_id = ${creationId}
  `;
  if (exists[0]) {
    await sql`
      delete from creation_likes
      where user_id = ${userId} and creation_id = ${creationId}
    `;
  } else {
    const pub = await sql<{ id: string }>`
      select id from creations where id = ${creationId} and is_public = true
    `;
    if (!pub[0]) return { liked: false, likeCount: 0 };
    await sql`
      insert into creation_likes (user_id, creation_id)
      values (${userId}, ${creationId})
      on conflict do nothing
    `;
  }
  const countRows = await sql<{ n: string | number }>`
    select count(*) as n from creation_likes where creation_id = ${creationId}
  `;
  const likeCount = Number(countRows[0]?.n ?? 0) || 0;
  return { liked: !exists[0], likeCount };
}

/**
 * Pure last-write-wins reconciliation (Req 2.2, design Property 1).
 *
 * Given two same-id creation records that each carry an `updated_at` value,
 * return the one whose `updated_at` is later. This performs NO I/O — it is a
 * pure decision function so it can be exercised directly by property tests.
 *
 * `updated_at` may be either an ISO `string` (as seen on the client after the
 * server-function boundary serializes the row) or a `Date` (as the pg/PGLite
 * drivers hand it back on the server); both are normalized to epoch millis for
 * the comparison.
 *
 * Ties resolve deterministically to `remote`: the server-authoritative record
 * wins when the timestamps are equal (or when either timestamp is unparseable,
 * so a garbage local clock can never displace the stored row).
 */
export function resolveByTimestamp<T extends { updated_at: string | Date }>(
  local: T,
  remote: T,
): T {
  const localMs = toEpochMs(local.updated_at);
  const remoteMs = toEpochMs(remote.updated_at);
  // Strictly-later local wins; equal or unparseable falls through to remote.
  return localMs > remoteMs ? local : remote;
}

/**
 * Normalize an `updated_at` value (ISO string or Date) to epoch milliseconds.
 * Returns `NaN` for an unparseable value so any comparison against it is false,
 * which makes `resolveByTimestamp` fall back to the server-authoritative record.
 */
function toEpochMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
