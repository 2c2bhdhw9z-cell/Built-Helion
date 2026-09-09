import { getSql } from "@/lib/db";
import type { AdminComment, PublicComment } from "./types.ts";

/**
 * Server-only data layer for creation comments (Item 9). Imports getSql()
 * (which throws in the browser), so this module must NEVER be imported by
 * client code — the server functions in functions.ts import it dynamically
 * inside their handlers, matching the feedback/creations pattern.
 *
 * No mock/seeded data: every row here comes from a real posted comment.
 */

type PublicCommentRow = {
  id: string;
  creation_id: string;
  author: string | null;
  body: string;
  created_at: string | Date;
};

type AdminCommentRow = PublicCommentRow & {
  user_id: string;
  hidden: boolean | number | string;
};

function authorLabel(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  return t || "No name";
}

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

/**
 * True when a creation exists AND is public. Comments (like likes) are only
 * allowed on public creations — a comment on a private/unknown creation is
 * rejected by the caller before any insert.
 */
export async function isCreationPublic(creationId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from creations where id = ${creationId} and is_public = true
  `;
  return rows.length > 0;
}

/**
 * Insert a comment on a PUBLIC creation and return its PUBLIC projection, or
 * null when the creation is not public (public-only rule, mirror of toggleLike).
 * The author display name is resolved from the profiles row at insert time for
 * the returned projection; only the account id + body are persisted (never an
 * email).
 */
export async function insertComment(
  userId: string,
  creationId: string,
  body: string,
): Promise<PublicComment | null> {
  const sql = await getSql();
  if (!(await isCreationPublic(creationId))) return null;

  const id = crypto.randomUUID();
  const rows = await sql<{ created_at: string | Date }>`
    insert into creation_comments (id, creation_id, user_id, body)
    values (${id}, ${creationId}, ${userId}, ${body})
    returning created_at
  `;
  const nameRows = await sql<{ display_name: string | null }>`
    select display_name from profiles where user_id = ${userId}
  `;
  return {
    id,
    creationId,
    author: authorLabel(nameRows[0]?.display_name),
    body,
    createdAt: rows[0]?.created_at ?? new Date(),
  };
}

/**
 * PUBLIC, PII-free comment list for a creation, newest first. Joins profiles for
 * the author display name (never an email) and EXCLUDES hidden comments — a
 * moderator-hidden comment never appears on the public path.
 */
export async function listPublicComments(creationId: string): Promise<PublicComment[]> {
  const sql = await getSql();
  const rows = await sql<PublicCommentRow>`
    select c.id, c.creation_id, c.body, c.created_at,
      coalesce(nullif(p.display_name, ''), '') as author
    from creation_comments c
    left join profiles p on p.user_id = c.user_id
    where c.creation_id = ${creationId} and c.hidden = false
    order by c.created_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    creationId: row.creation_id,
    author: authorLabel(row.author),
    body: row.body,
    createdAt: row.created_at,
  }));
}

/**
 * ADMIN comment list for a creation, newest first — INCLUDES hidden comments
 * (with the `hidden` flag) and the author id so a moderator can act. Still never
 * selects an email (none is stored).
 */
export async function listAdminComments(creationId: string): Promise<AdminComment[]> {
  const sql = await getSql();
  const rows = await sql<AdminCommentRow>`
    select c.id, c.creation_id, c.user_id, c.body, c.created_at, c.hidden,
      coalesce(nullif(p.display_name, ''), '') as author
    from creation_comments c
    left join profiles p on p.user_id = c.user_id
    where c.creation_id = ${creationId}
    order by c.created_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    creationId: row.creation_id,
    userId: row.user_id,
    author: authorLabel(row.author),
    body: row.body,
    createdAt: row.created_at,
    hidden: asBool(row.hidden),
  }));
}

/** Soft-hide a comment (moderation). Returns true when a row was updated. */
export async function hideComment(id: string, hidden: boolean): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update creation_comments set hidden = ${hidden}
    where id = ${id}
    returning id
  `;
  return rows.length > 0;
}

/** Hard-delete a comment (moderation). Returns true when a row was removed. */
export async function deleteComment(id: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from creation_comments where id = ${id} returning id
  `;
  return rows.length > 0;
}
