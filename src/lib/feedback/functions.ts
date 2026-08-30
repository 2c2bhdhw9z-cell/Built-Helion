import { createServerFn } from "@tanstack/react-start";
import {
  adminAccessSchema,
  submitFeedbackSchema,
  updateStatusSchema,
  voteFeedbackSchema,
  type FeedbackItem,
  type PublicFeedbackItem,
} from "./types.ts";

/**
 * TanStack Start server functions for the feedback system. Each validates its
 * input with a zod schema from types.ts, then dynamically imports the
 * server-only DB layer (./server.ts) inside the handler so getSql() and its
 * transitive server-only code never enter the client bundle.
 *
 * AUTHORIZATION: the ADMIN surface (list + status update) is gated SERVER-SIDE
 * by ./admin-auth.server.ts (assertAdmin). An unauthorized caller is rejected
 * with a ForbiddenError — the loader turns that into an empty list, never mock
 * rows — so submitter PII and write access are never exposed on a public
 * deploy. See admin-auth.server.ts for the two supported mechanisms
 * (FEEDBACK_ADMIN_TOKEN, ADMIN_EMAILS) and the local-dev fallback.
 */

/**
 * Submit a new feedback entry; returns the persisted row. Public + unauthed by
 * design (anyone can leave feedback), but guarded by a lightweight in-memory
 * per-IP throttle to blunt scripted spam / unbounded row growth.
 */
export const submitFeedbackFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => submitFeedbackSchema.parse(input))
  .handler(async ({ data }): Promise<FeedbackItem> => {
    const { throttleSubmit } = await import("./throttle.server.ts");
    await throttleSubmit();
    const { insertFeedback } = await import("./server.ts");
    return insertFeedback(data);
  });

/**
 * List PUBLIC feedback for the in-sim votable board. Public + unauthed by
 * design: no login required to view. The payload comes from listPublicFeedback,
 * which SELECTs only public columns — user_email/PII is never included here.
 */
export const listPublicFeedbackFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicFeedbackItem[]> => {
    const { listPublicFeedback } = await import("./server.ts");
    return listPublicFeedback();
  },
);

/**
 * Upvote a feedback item and return the updated PUBLIC row (or null if the id is
 * unknown). Public + unauthed by design (no login required to vote), guarded by
 * a per-IP throttle to blunt scripted vote floods. Never exposes user_email.
 */
export const voteFeedbackFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => voteFeedbackSchema.parse(input))
  .handler(async ({ data }): Promise<PublicFeedbackItem | null> => {
    const { throttleVote } = await import("./throttle.server.ts");
    await throttleVote();
    const { incrementFeedbackVotes } = await import("./server.ts");
    return incrementFeedbackVotes(data.id);
  });

/**
 * List all feedback entries, newest first. ADMIN-ONLY: authorized server-side
 * via assertAdmin (throws ForbiddenError when the caller is not an admin).
 */
export const listFeedbackFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminAccessSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<FeedbackItem[]> => {
    const { assertAdmin } = await import("./admin-auth.server.ts");
    await assertAdmin(data.token);
    const { listFeedback } = await import("./server.ts");
    return listFeedback();
  });

/**
 * Report whether the CURRENT caller is an admin, resolved entirely server-side.
 * Calls assertAdmin() with NO token, so it authorizes only a verified
 * allowlisted signed-in account (or the local no-database dev fallback). It
 * returns ONLY a boolean — never an email or the ADMIN_EMAILS allowlist — so it
 * is safe to call from the client (e.g. to reveal an Admin entry point in the
 * UI). The dynamic import keeps the server-only admin module out of the client
 * bundle, matching the other feedback fns.
 */
export const isAdminFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ isAdmin: boolean }> => {
    try {
      const { assertAdmin } = await import("./admin-auth.server.ts");
      await assertAdmin();
      return { isAdmin: true };
    } catch {
      return { isAdmin: false };
    }
  },
);

/**
 * Update an existing submission's status; returns the updated row or null.
 * ADMIN-ONLY: authorized server-side via assertAdmin.
 */
export const updateFeedbackStatusFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateStatusSchema.parse(input))
  .handler(async ({ data }): Promise<FeedbackItem | null> => {
    const { assertAdmin } = await import("./admin-auth.server.ts");
    await assertAdmin(data.token);
    const { updateFeedbackStatus } = await import("./server.ts");
    return updateFeedbackStatus(data.id, data.status);
  });
