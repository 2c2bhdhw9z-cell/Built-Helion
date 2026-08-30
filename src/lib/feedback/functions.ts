import { createServerFn } from "@tanstack/react-start";
import {
  adminAccessSchema,
  submitFeedbackSchema,
  updateStatusSchema,
  type FeedbackItem,
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
