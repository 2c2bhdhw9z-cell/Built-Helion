import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  deleteCreationSchema,
  saveCreationSchema,
  sharedCreationSchema,
  type CreationRow,
  type PublicCreation,
} from "./types.ts";

/**
 * TanStack Start server functions for saved creations.
 *
 * The owner-scoped fns (save/list/delete) use `authMiddleware`, so they run
 * ONLY for a signed-in caller and scope every query to the verified
 * `context.userId`. Nothing here forces login to USE the sim — these are only
 * invoked when a signed-in user chooses to save/manage creations.
 *
 * getSharedCreationFn is the ONE public/no-auth read: it omits the middleware
 * (mirroring feedback's listPublicFeedbackFn / voteFeedbackFn) so anyone with a
 * share link can load and run a creation without signing in, and it returns a
 * PII-free { id, name, config } payload only — never user_id/email.
 *
 * Every handler dynamically imports the server-only DB layer (./server.ts) so
 * getSql() and its transitive server-only code never enter the client bundle.
 */

/** Save a new creation for the signed-in user; returns the persisted row. */
export const saveCreationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => saveCreationSchema.parse(input))
  .handler(async ({ data, context }): Promise<CreationRow> => {
    const { insertCreation } = await import("./server.ts");
    return insertCreation(context.userId, data.name, data.config);
  });

/** List the signed-in user's own creations, newest first. */
export const listCreationsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CreationRow[]> => {
    const { listCreations } = await import("./server.ts");
    return listCreations(context.userId);
  });

/**
 * Delete one of the signed-in user's creations. Ownership is enforced in the
 * DB layer's WHERE clause (id AND user_id). Returns whether a row was deleted.
 */
export const deleteCreationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => deleteCreationSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ deleted: boolean }> => {
    const { deleteCreation } = await import("./server.ts");
    const deleted = await deleteCreation(context.userId, data.id);
    return { deleted };
  });

/**
 * Load a shared creation by its id (share token). Public + unauthed by design:
 * NO authMiddleware, so no login is required to view a shared creation. Returns
 * only the PII-free { id, name, config } projection (or null if the id is
 * unknown) — never user_id/email/PII.
 */
export const getSharedCreationFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => sharedCreationSchema.parse(input))
  .handler(async ({ data }): Promise<PublicCreation | null> => {
    const { getPublicCreation } = await import("./server.ts");
    return getPublicCreation(data.id);
  });
