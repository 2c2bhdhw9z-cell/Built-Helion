import { getSql } from "@/lib/db";
import type { AdminAccount, AdminAnalytics } from "./types.ts";

/**
 * Server-only Admin_Service data layer (Reqs 5, 6).
 *
 * Every value here is computed from stored rows — no seeding, no fabricated
 * counts. All queries go through `getSql()` so they run identically on Neon
 * (production) and the embedded PGLite fallback (preview/tests).
 *
 * Authorization is NOT performed here: these functions assume the caller has
 * already been authorized. The `assertAdmin` gate lives in the server-function
 * layer (`src/lib/admin/functions.ts`, task 4.2), and the suspended-write gate
 * (`assertNotSuspended`) lives in `src/lib/admin/guard.server.ts` (task 2.8);
 * neither belongs in this data layer.
 */

type AccountRow = {
  id: string;
  name: string | null;
  display_name: string | null;
  creations: string | number;
  likes: string | number;
  suspended: boolean | number | string | null;
};

function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

/** A display label for an account: the chosen profile name, else the Better
 * Auth `user.name`, else a stable placeholder — never an email. */
function accountLabel(displayName: string | null, name: string | null): string {
  const d = (displayName ?? "").trim();
  if (d) return d;
  const n = (name ?? "").trim();
  return n || "No name";
}

/**
 * List every account with its aggregate creation and like counts and its
 * suspended flag (Req 5.1). Joins the Better Auth `"user"` table (id, name) with
 * per-user creation counts, likes received on that user's public creations, and
 * the `account_status.suspended` flag. Counts are correlated subqueries so an
 * account with no creations/likes resolves to `0`, and the `like_count`
 * correlates likes to the OWNER of the liked creation (likes received), matching
 * the profile-stats query. All computed from stored rows only.
 */
export async function listAccounts(): Promise<AdminAccount[]> {
  const sql = await getSql();
  const rows = await sql<AccountRow>`
    select
      u."id" as id,
      u."name" as name,
      p.display_name as display_name,
      (select count(*) from creations c where c.user_id = u."id") as creations,
      (
        select count(*)
        from creation_likes l
        inner join creations c on c.id = l.creation_id
        where c.user_id = u."id"
      ) as likes,
      coalesce(s.suspended, false) as suspended
    from "user" u
    left join profiles p on p.user_id = u."id"
    left join account_status s on s.user_id = u."id"
    order by u."id" asc
  `;
  return rows.map((r) => ({
    id: r.id,
    displayName: accountLabel(r.display_name, r.name),
    creations: num(r.creations),
    likes: num(r.likes),
    suspended: asBool(r.suspended),
  }));
}

/**
 * Mark an account suspended (Req 5.2): upsert `account_status.suspended = true`
 * and record an audit entry attributed to the acting admin. While suspended the
 * write gate rejects that account's authenticated writes (Req 5.3, enforced by
 * `assertNotSuspended`).
 */
export async function suspendAccount(adminId: string, targetId: string): Promise<void> {
  await setSuspended(targetId, true);
  const { writeAudit } = await import("@/lib/audit/server");
  await writeAudit(adminId, "account.suspend", targetId);
}

/**
 * Reinstate a suspended account (Req 5.4): upsert `account_status.suspended =
 * false` and record an audit entry attributed to the acting admin.
 */
export async function reinstateAccount(adminId: string, targetId: string): Promise<void> {
  await setSuspended(targetId, false);
  const { writeAudit } = await import("@/lib/audit/server");
  await writeAudit(adminId, "account.reinstate", targetId);
}

/** Upsert the suspended flag for an account, stamping `updated_at`. */
async function setSuspended(targetId: string, suspended: boolean): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into account_status (user_id, suspended, updated_at)
    values (${targetId}, ${suspended}, now())
    on conflict (user_id) do update set
      suspended = excluded.suspended,
      updated_at = now()
  `;
}

type AnalyticsRow = {
  accounts: string | number;
  saved_creations: string | number;
  published_creations: string | number;
  total_likes: string | number;
};

/**
 * Aggregate analytics over stored rows (Reqs 6.1, 6.2, 6.3): total account
 * count, saved-creation count, published (public) creation count, and total
 * likes. Every metric is a `count(*)` over stored rows and resolves to `0` when
 * no rows exist — no seeded or fabricated values.
 */
export async function getAnalytics(): Promise<AdminAnalytics> {
  const sql = await getSql();
  const rows = await sql<AnalyticsRow>`
    select
      (select count(*) from "user") as accounts,
      (select count(*) from creations) as saved_creations,
      (select count(*) from creations where is_public = true) as published_creations,
      (select count(*) from creation_likes) as total_likes
  `;
  const r = rows[0];
  return {
    accounts: num(r?.accounts),
    savedCreations: num(r?.saved_creations),
    publishedCreations: num(r?.published_creations),
    totalLikes: num(r?.total_likes),
  };
}
