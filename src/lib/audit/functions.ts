import { createServerFn } from "@tanstack/react-start";
import { adminAccessSchema } from "@/lib/feedback/types.ts";
import { z } from "zod";

/**
 * TanStack Start server function for the admin-wide audit view (Req 14).
 *
 * ADMIN-ONLY and FAIL-CLOSED: the handler calls `assertAdmin(token)` from
 * `@/lib/feedback/admin-auth.server.ts` FIRST — the SAME shared, constant-time,
 * fail-closed gate every other admin surface uses (account management,
 * analytics, telemetry, curation). A non-admin caller throws `ForbiddenError`,
 * which is caught and mapped to an EMPTY list so NO audit entries ever leak to
 * an unauthorized viewer (Req 14.4). This mirrors `listAccountsFn` in
 * `src/lib/admin/functions.ts`.
 *
 * Both the gate (`@/lib/feedback/admin-auth.server.ts`) and the data layer
 * (`./server.ts`) are imported DYNAMICALLY inside the handler — exactly like
 * the feedback/admin functions — so `getSql()` and the rest of the server-only
 * code never enter the client bundle.
 *
 * The data layer (`listAllAudit`) returns entries across ALL accounts ordered
 * by recorded time descending (newest-first) and clamps the count to the
 * configured maximum (Reqs 14.1, 14.3).
 */

/** A cross-account audit entry as returned to an authorized admin. `at` is the
 * recorded time; the pg/PGLite drivers hand back a `Date` on the server and an
 * ISO `string` once serialized across the server-function boundary (the same
 * shape story as feedback's `created_at`), so it is typed `string | Date`. */
export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  at: string | Date;
  userId: string;
}

/**
 * Validates an audit-view request: the optional shared admin token (validated
 * server-side, never trusted client-side — reusing the shared
 * `adminAccessSchema` shape) plus an optional `limit`. The data layer clamps
 * the effective limit to the configured maximum (Req 14.3).
 */
const auditViewSchema = adminAccessSchema.extend({
  limit: z.number().int().positive().optional(),
});

/**
 * Return the cross-account audit view (Reqs 14.1, 14.3). ADMIN-ONLY:
 * `assertAdmin` runs first; a non-admin caller throws `ForbiddenError`, mapped
 * to an EMPTY list so no audit entries leak (Req 14.4).
 */
export const listAllAuditFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => auditViewSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<AuditEntry[]> => {
    try {
      const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
      await assertAdmin(data.token);
    } catch {
      return [];
    }
    const { listAllAudit } = await import("./server.ts");
    return listAllAudit(data.limit);
  });
