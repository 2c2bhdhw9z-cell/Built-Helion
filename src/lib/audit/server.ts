import { getSql } from "@/lib/db";

export async function writeAudit(userId: string, action: string, detail = ""): Promise<void> {
  try {
    const sql = await getSql();
    await sql`
      insert into audit_logs (id, user_id, action, detail)
      values (${crypto.randomUUID()}, ${userId}, ${action.slice(0, 80)}, ${detail.slice(0, 240)})
    `;
  } catch {
    /* table may not exist yet on a stale process */
  }
}

export async function listAudit(userId: string, limit = 40): Promise<{ id: string; action: string; detail: string; at: string | Date }[]> {
  const sql = await getSql();
  const rows = await sql<{ id: string; action: string; detail: string; created_at: string | Date }>`
    select id, action, detail, created_at from audit_logs
    where user_id = ${userId}
    order by created_at desc
    limit ${Math.max(1, Math.min(100, limit))}
  `;
  return rows.map((r) => ({ id: r.id, action: r.action, detail: r.detail, at: r.created_at }));
}


/**
 * Cross-account audit view for admins (Req 14.1, 14.3).
 *
 * Returns audit entries across ALL accounts ordered by `created_at`
 * descending (most recent first), clamped to a configured maximum using the
 * same 1..100 clamp style as {@link listAudit} (default 100). Because this is
 * an admin-wide view rather than an owner-scoped one, the mapped shape includes
 * `userId` (the acting account) in addition to the fields returned by
 * `listAudit`. Authorization is NOT performed here: the `assertAdmin` gate lives
 * in the server-function layer (task 13.2), matching the rest of the admin
 * surface.
 */
export async function listAllAudit(
  limit = 100,
): Promise<{ id: string; action: string; detail: string; at: string | Date; userId: string }[]> {
  const sql = await getSql();
  const rows = await sql<{ id: string; user_id: string; action: string; detail: string; created_at: string | Date }>`
    select id, user_id, action, detail, created_at from audit_logs
    order by created_at desc
    limit ${Math.max(1, Math.min(100, limit))}
  `;
  return rows.map((r) => ({ id: r.id, action: r.action, detail: r.detail, at: r.created_at, userId: r.user_id }));
}
