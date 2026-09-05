import { getSql } from "@/lib/db";

/**
 * Server-only suspended-account WRITE gate (Req 5.3).
 *
 * A suspended account may still READ its data — suspension only blocks
 * authenticated *writes*. This helper is invoked inside authenticated write
 * server functions / REST write handlers (save creation, set-public,
 * toggle-like, profile upsert, usage merge, control-queue write) after the
 * user id is resolved and BEFORE the write touches any data, so a rejected
 * write never mutates the store. Reads never call it and are unaffected.
 *
 * It is a dedicated server-only module (imports `@/lib/db`, which throws in the
 * browser) and is meant to be *dynamically* imported from inside the write
 * handlers — mirroring how the feedback functions dynamically import
 * `admin-auth.server.ts` — so the client bundle never pulls it in.
 *
 * The gate reads the `account_status` table (migration 0009): a row with
 * `suspended = true` blocks writes; an absent row or `suspended = false`
 * passes. It never fabricates data — an unreadable/missing status simply means
 * "not suspended".
 */

/**
 * Thrown when a suspended account attempts an authenticated write. Carries
 * `status: 403` so a route/server function can map it to a forbidden response,
 * matching the `ForbiddenError` convention in
 * `src/lib/feedback/admin-auth.server.ts`.
 */
export class SuspendedError extends Error {
  readonly status = 403;
  constructor(message = "Account suspended") {
    super(message);
    this.name = "SuspendedError";
  }
}

/**
 * Reject the write of a suspended account, or resolve when the account may
 * write (Req 5.3).
 *
 * Queries `account_status` for the given user id and THROWS `SuspendedError`
 * when that account is marked suspended. When there is no status row, or the
 * row's `suspended` flag is false, it resolves and the caller proceeds with the
 * write. Reads must not invoke this — it is only wired into writes.
 *
 * @param userId The resolved, verified account id performing the write.
 */
export async function assertNotSuspended(userId: string): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ suspended: boolean | number | string }>`
    select suspended from account_status where user_id = ${userId}
  `;
  const row = rows[0];
  if (row && isSuspended(row.suspended)) {
    throw new SuspendedError();
  }
}

/**
 * Normalize the `suspended` column to a boolean. The pg and PGLite drivers can
 * hand a boolean back as `true`, `"t"`, `"true"`, `1`, or `"1"`, so treat any
 * of those truthy forms as suspended (matching `asBool` in
 * `src/lib/creations/server.ts`).
 */
function isSuspended(value: boolean | number | string): boolean {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}
