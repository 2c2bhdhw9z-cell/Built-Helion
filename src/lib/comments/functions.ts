import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  adminListCommentsSchema,
  hideCommentSchema,
  listCommentsSchema,
  moderateCommentSchema,
  postCommentSchema,
  type AdminComment,
  type PublicComment,
} from "./types.ts";

/**
 * TanStack Start server functions for creation comments (Item 9), following the
 * feedback pattern: public reads project PII-free rows; the authenticated write
 * runs the suspended-write guard + a posting throttle; admin moderation is gated
 * server-side by assertAdmin. Each handler dynamically imports the server-only
 * ./server.ts so getSql() and its transitive server code never enter the client
 * bundle.
 */

/**
 * Post a comment on a PUBLIC creation. authMiddleware ensures a signed-in
 * author; the suspended-write guard blocks suspended accounts (matching the
 * creations write fns); a lightweight throttle blunts spam. The body is
 * length-capped by the zod schema. Commenting on a private/unknown creation is
 * rejected server-side (public-only rule) — returns null.
 */
export const postCommentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => postCommentSchema.parse(input))
  .handler(async ({ data, context }): Promise<PublicComment | null> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { throttleComment } = await import("@/lib/feedback/throttle.server.ts");
    await throttleComment();
    const { insertComment } = await import("./server.ts");
    return insertComment(context.userId, data.creationId, data.body);
  });

/**
 * List a creation's PUBLIC comments (PII-free, hidden excluded). Public +
 * unauthed by design — no login required to read comments.
 */
export const listCommentsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => listCommentsSchema.parse(input))
  .handler(async ({ data }): Promise<PublicComment[]> => {
    const { listPublicComments } = await import("./server.ts");
    return listPublicComments(data.creationId);
  });

/**
 * ADMIN: list a creation's comments INCLUDING hidden ones, for moderation.
 * Authorized server-side via assertAdmin (throws ForbiddenError otherwise).
 */
export const listAdminCommentsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    listCommentsSchema.merge(adminListCommentsSchema).parse(input),
  )
  .handler(async ({ data }): Promise<AdminComment[]> => {
    const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
    await assertAdmin(data.token);
    const { listAdminComments } = await import("./server.ts");
    return listAdminComments(data.creationId);
  });

/**
 * ADMIN: soft-hide (or unhide) a comment. A hidden comment is excluded from the
 * public list but retained for review. Authorized server-side via assertAdmin.
 */
export const hideCommentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => hideCommentSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
    await assertAdmin(data.token);
    const { hideComment } = await import("./server.ts");
    const ok = await hideComment(data.id, data.hidden);
    return { ok };
  });

/**
 * ADMIN: hard-delete a comment. Authorized server-side via assertAdmin.
 */
export const deleteCommentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => moderateCommentSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
    await assertAdmin(data.token);
    const { deleteComment } = await import("./server.ts");
    const ok = await deleteComment(data.id);
    return { ok };
  });
