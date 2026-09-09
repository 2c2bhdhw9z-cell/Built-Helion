import { getSql } from "@/lib/db";
import type {
  AdminAccount,
  AdminAnalytics,
  AdminBreakdownSlice,
  AdminDashboardAnalytics,
} from "./types.ts";

/**
 * The recency window (days) for the "active users" metric (Req 12): an account
 * counts as active when its `usage_stats.updated_at` falls within this window.
 */
export const ACTIVE_WINDOW_DAYS = 30;

/** How many top generators the dashboard surfaces. */
export const TOP_GENERATORS = 8;

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


/**
 * Mark or unmark a public creation as featured for the editorial curated row
 * (Reqs 13.2, 13.3). Sets `creations.featured` to the given value. When setting
 * `featured = true`, records an audit entry attributed to the acting admin
 * (Req 13.2); removing a mark (`featured = false`) clears the flag without an
 * audit entry (Req 13.3). Authorization (`assertAdmin`) is enforced by the
 * server-function layer, not here.
 */
export async function setFeatured(
  adminId: string,
  creationId: string,
  featured: boolean,
): Promise<void> {
  const sql = await getSql();
  await sql`
    update creations
    set featured = ${featured}
    where id = ${creationId}
  `;
  if (featured) {
    const { writeAudit } = await import("@/lib/audit/server");
    await writeAudit(adminId, "creation.feature", creationId);
  }
}

/**
 * Pure generator-popularity aggregation (Req 12) — no I/O, so it is directly
 * unit-testable. Sums each account's `usage_stats.generators` map (generator
 * kind → use count) across every account into a single ranked list, descending
 * by total count with the generator label as a stable tie-break, capped to
 * `limit`. Ignores non-positive/garbage counts and empty labels so a malformed
 * stored map can never inject a bogus slice.
 */
export function aggregateGeneratorPopularity(
  maps: Array<Record<string, unknown> | null | undefined>,
  limit: number = TOP_GENERATORS,
): AdminBreakdownSlice[] {
  const totals = new Map<string, number>();
  for (const map of maps) {
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const [rawKey, rawCount] of Object.entries(map)) {
      const label = String(rawKey ?? "").trim();
      if (!label) continue;
      const n = typeof rawCount === "number" ? rawCount : Number(rawCount);
      if (!Number.isFinite(n) || n <= 0) continue;
      totals.set(label, (totals.get(label) ?? 0) + Math.round(n));
    }
  }
  return [...totals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, limit));
}

/**
 * Richer aggregate dashboard analytics (Req 12) — active users, popular
 * generators, and device/particle breakdowns — all derived from data already
 * collected server-side (`usage_stats`, `telemetry_samples`). Every value is an
 * aggregate count; NO per-user or identifying data is projected (Req 12.3).
 *
 * Active users and generator popularity come from `usage_stats`; the device-tier
 * and particle-bucket breakdowns come from opt-in `telemetry_samples`. Empty
 * tables yield empty lists / zero counts — never fabricated data.
 */
export async function getDashboardAnalytics(): Promise<AdminDashboardAnalytics> {
  const sql = await getSql();

  // Active users: usage rows touched within the recency window. The window is
  // computed app-side and passed as a bound so the query is a simple, indexable
  // comparison that works identically on Neon and PGLite.
  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const activeRows = await sql<{ active: string | number }>`
    select count(*) as active from usage_stats where updated_at >= ${activeSince}
  `;
  const activeUsers = num(activeRows[0]?.active);

  // Popular generators: aggregate the per-account generators map in app code
  // (jsonb key aggregation is backend-specific; reading the maps and summing in
  // JS keeps it portable and lets the pure aggregator be unit-tested).
  const genRows = await sql<{ generators: unknown }>`
    select generators from usage_stats
  `;
  const popularGenerators = aggregateGeneratorPopularity(
    genRows.map((r) => (r.generators ?? {}) as Record<string, unknown>),
  );

  // Device-tier breakdown from telemetry, descending by sample count.
  const tierRows = await sql<{ device_tier: string; n: string | number }>`
    select device_tier, count(*) as n
    from telemetry_samples
    group by device_tier
    order by n desc, device_tier asc
  `;
  const deviceTiers: AdminBreakdownSlice[] = tierRows.map((r) => ({
    label: (r.device_tier ?? "").trim() || "unknown",
    count: num(r.n),
  }));

  // Particle-bucket breakdown from telemetry, ascending by bucket so the chart
  // reads low → high particle counts.
  const bucketRows = await sql<{ particle_bucket: string | number; n: string | number }>`
    select particle_bucket, count(*) as n
    from telemetry_samples
    group by particle_bucket
    order by particle_bucket asc
  `;
  const particleBuckets: AdminBreakdownSlice[] = bucketRows.map((r) => ({
    label: String(num(r.particle_bucket)),
    count: num(r.n),
  }));

  const telemetrySamples = deviceTiers.reduce((acc, s) => acc + s.count, 0);

  return { activeUsers, popularGenerators, deviceTiers, particleBuckets, telemetrySamples };
}
