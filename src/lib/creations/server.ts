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

function toCreationRow(row: RawCreationRow): CreationRow {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    config: normalizeCreationConfig(row.config) ?? normalizeCreationConfig({})!,
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
  return toCreationRow(rows[0]);
}

export async function listCreations(userId: string): Promise<CreationRow[]> {
  const sql = await getSql();
  const rows = await sql<RawCreationRow>`
    select id, user_id, name, config, created_at, is_public
    from creations
    where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map(toCreationRow);
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
  return {
    id: row.id,
    name: row.name,
    config: normalizeCreationConfig(row.config) ?? normalizeCreationConfig({})!,
  };
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

function toLibraryItem(row: LibraryRow, likedIds: Set<string>): LibraryItem {
  const likeCount = typeof row.like_count === "number" ? row.like_count : Number(row.like_count) || 0;
  return {
    id: row.id,
    name: row.name,
    config: normalizeCreationConfig(row.config) ?? normalizeCreationConfig({})!,
    created_at: row.created_at,
    author: (row.author && row.author.trim()) || "Helion",
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
            coalesce(nullif(p.display_name, ''), 'Helion') as author,
            (select count(*) from creation_likes l where l.creation_id = c.id) as like_count
          from creations c
          left join profiles p on p.user_id = c.user_id
          where c.is_public = true
          order by like_count desc, c.created_at desc
          limit 48
        `
      : await sql<LibraryRow>`
          select c.id, c.name, c.config, c.created_at,
            coalesce(nullif(p.display_name, ''), 'Helion') as author,
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
  return rows.map((row) => toLibraryItem(row, likedIds));
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
