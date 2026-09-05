import { createServerFn } from "@tanstack/react-start";
import { adminAccessSchema } from "@/lib/feedback/types.ts";
import { z } from "zod";
import type { AdminAccount, AdminAnalytics } from "./types.ts";

/**
 * TanStack Start server functions for the Admin Dashboard (Reqs 4, 5, 6).
 *
 * Every admin function is gated SERVER-SIDE by the SAME fail-closed,
 * constant-time gate the feedback surface uses: `assertAdmin` from
 * `@/lib/feedback/admin-auth.server.ts` (Reqs 4.1–4.6). That gate is the single
 * authorization decision for all admin surfaces — one token compare
 * (`timingSafeEqual`-based), one verified-email allowlist, one "deny when a
 * database is configured and no mechanism is set" rule. There is no UI-only
 * protection: each handler calls `assertAdmin(token)` FIRST, before touching the
 * data layer, and a denial (ForbiddenError) is mapped to an empty/forbidden
 * result so no privileged rows ever leak to a non-admin caller (Reqs 5.5, 6.4).
 *
 * Both the gate (`./admin-auth.server.ts`) and the data layer (`./server.ts`)
 * are imported DYNAMICALLY inside each handler — exactly like
 * `feedback/functions.ts` — so `getSql()` and the rest of the server-only code
 * never enter the client bundle.
 *
 * Inputs are validated with zod: admin reads accept the shared
 * `adminAccessSchema` (an optional `token`); the suspend/reinstate mutations
 * additionally carry the `targetId` of the account being acted on. The acting
 * admin's id is recorded on the audit entry the data layer writes; when no
 * signed-in session id is resolvable (e.g. the shared-token mechanism on a
 * no-sign-in deploy) we attribute the action to a stable "admin" actor.
 */

/** Resolve the acting admin's user id for audit attribution, or a stable
 * fallback when no signed-in session is available (e.g. the shared-token
 * mechanism). Never throws — attribution must not block an authorized action. */
async function resolveAdminActorId(): Promise<string> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (user?.id) return user.id;
  } catch {
    // No session resolvable (shared-token / no-sign-in deploy) — fall through.
  }
  return "admin";
}

/** Validates a suspend/reinstate request: the target account id plus the
 * optional shared admin token (validated server-side, never trusted client-side). */
const accountActionSchema = z.object({
  targetId: z.string().min(1),
  token: z.string().optional(),
});

/**
 * List every account with aggregate creation/like counts and its suspended flag
 * (Req 5.1). ADMIN-ONLY: `assertAdmin` runs first; a non-admin caller throws
 * ForbiddenError, which is mapped to an EMPTY list so no account rows leak
 * (Req 5.5).
 */
export const listAccountsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminAccessSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<AdminAccount[]> => {
    try {
      const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
      await assertAdmin(data.token);
    } catch {
      return [];
    }
    const { listAccounts } = await import("./server.ts");
    return listAccounts();
  });

/**
 * Aggregate analytics over stored rows (Req 6.1). ADMIN-ONLY: `assertAdmin` runs
 * first; a non-admin caller throws ForbiddenError, mapped to `null` so no
 * analytics are returned (Req 6.4).
 */
export const getAnalyticsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminAccessSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<AdminAnalytics | null> => {
    try {
      const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
      await assertAdmin(data.token);
    } catch {
      return null;
    }
    const { getAnalytics } = await import("./server.ts");
    return getAnalytics();
  });

/**
 * Suspend an account (Req 5.2): marks it suspended and records an audit entry.
 * ADMIN-ONLY: `assertAdmin` runs first; a non-admin caller is denied with
 * `{ ok: false }` and no data is changed (Req 5.5).
 */
export const suspendAccountFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => accountActionSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
      await assertAdmin(data.token);
    } catch {
      return { ok: false };
    }
    const adminId = await resolveAdminActorId();
    const { suspendAccount } = await import("./server.ts");
    await suspendAccount(adminId, data.targetId);
    return { ok: true };
  });

/**
 * Reinstate a suspended account (Req 5.4): clears the suspended mark and records
 * an audit entry. ADMIN-ONLY: `assertAdmin` runs first; a non-admin caller is
 * denied with `{ ok: false }` and no data is changed (Req 5.5).
 */
export const reinstateAccountFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => accountActionSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
      await assertAdmin(data.token);
    } catch {
      return { ok: false };
    }
    const adminId = await resolveAdminActorId();
    const { reinstateAccount } = await import("./server.ts");
    await reinstateAccount(adminId, data.targetId);
    return { ok: true };
  });

/**
 * Report whether the CURRENT caller is an admin, resolved entirely server-side.
 * The Admin Dashboard reuses feedback's `isAdminFn` for the UI capability check
 * (per task 4.2 — no need to duplicate it), so this module re-exports it rather
 * than defining a second one. It calls `assertAdmin()` with NO token and returns
 * ONLY a boolean, so it is safe to call from the client (e.g. to reveal an admin
 * entry point) without leaking the allowlist.
 */
export { isAdminFn } from "@/lib/feedback/functions.ts";
