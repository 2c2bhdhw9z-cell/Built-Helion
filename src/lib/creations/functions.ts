import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  deleteCreationSchema,
  forkCreationSchema,
  libraryQuerySchema,
  saveCreationSchema,
  setPublicSchema,
  sharedCreationSchema,
  toggleLikeSchema,
  updateCreationSchema,
  type CreationRow,
  type LibraryItem,
  type PublicCreation,
  type SaveCreationResult,
  type UpdateCreationResult,
} from "./types.ts";

/**
 * Save a NEW creation. The free-tier private-creation quota (Item 23) is
 * enforced server-side in `saveCreationGuarded`, which re-derives entitlement
 * from the caller's billing (the client `entitled` flag is never trusted for
 * this resource-protecting write). Returns a discriminated result so the UI can
 * distinguish a successful save from a `limit` hit and surface an upgrade
 * prompt without treating the block as an error.
 */
export const saveCreationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => saveCreationSchema.parse(input))
  .handler(async ({ data, context }): Promise<SaveCreationResult> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { saveCreationGuarded } = await import("./server.ts");
    return saveCreationGuarded(context.userId, data.name, data.config);
  });

/**
 * Update a creation IN PLACE with conflict resolution (Req 2 — "newer wins with
 * a warning"). The client sends `baseUpdatedAt`, the `updated_at` it last
 * loaded; the server refuses to overwrite when a NEWER version exists (edited on
 * another device) and returns a `conflict` status the UI surfaces as a
 * non-destructive warning, rather than a silent last-write-wins overwrite.
 */
export const updateCreationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => updateCreationSchema.parse(input))
  .handler(async ({ data, context }): Promise<UpdateCreationResult> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { updateCreationChecked } = await import("./server.ts");
    return updateCreationChecked(
      context.userId,
      data.id,
      data.name,
      data.config,
      data.baseUpdatedAt,
    );
  });

/**
 * Fork/remix a PUBLIC creation into a NEW creation owned by the caller (Item 3).
 * authMiddleware ensures a signed-in owner; the suspended-write guard blocks
 * suspended accounts (matching saveCreationFn/updateCreationFn). The source must
 * be public — forking a private creation you don't own returns { ok: false }.
 */
export const forkCreationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => forkCreationSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; row: CreationRow | null }> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { forkCreation } = await import("./server.ts");
    const row = await forkCreation(context.userId, data.sourceId);
    return { ok: row !== null, row };
  });

export const listCreationsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CreationRow[]> => {
    const { listCreations } = await import("./server.ts");
    return listCreations(context.userId);
  });

export const deleteCreationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => deleteCreationSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ deleted: boolean }> => {
    const { deleteCreation } = await import("./server.ts");
    const deleted = await deleteCreation(context.userId, data.id);
    return { deleted };
  });

export const setCreationPublicFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => setPublicSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { setCreationPublic } = await import("./server.ts");
    const ok = await setCreationPublic(context.userId, data.id, data.isPublic);
    return { ok };
  });

export const toggleLikeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => toggleLikeSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ liked: boolean; likeCount: number }> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { toggleLike } = await import("./server.ts");
    return toggleLike(context.userId, data.id);
  });

export const getSharedCreationFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => sharedCreationSchema.parse(input))
  .handler(async ({ data }): Promise<PublicCreation | null> => {
    const { getPublicCreation } = await import("./server.ts");
    return getPublicCreation(data.id);
  });

/**
 * Public library browse. Unauthenticated on purpose so anyone can look.
 * Likes the viewer owns are filled in when a session is present — we try to
 * read the user id without requiring login.
 */
export const listLibraryFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => libraryQuerySchema.parse(input ?? { sort: "recent" }))
  .handler(async ({ data }): Promise<LibraryItem[]> => {
    const { listLibrary } = await import("./server.ts");
    return listLibrary(data.sort, null);
  });

/** Signed-in library browse so heart state is accurate. */
export const listLibraryAuthFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => libraryQuerySchema.parse(input ?? { sort: "recent" }))
  .handler(async ({ data, context }): Promise<LibraryItem[]> => {
    const { listLibrary } = await import("./server.ts");
    return listLibrary(data.sort, context.userId);
  });

/**
 * Public editorial curated row (Reqs 13.1, 13.4).
 *
 * Unauthenticated on purpose — anyone browsing the library can see the
 * hand-picked row, exactly like `listLibraryFn`. Returns only creations an
 * admin has marked featured AND that are public; a non-public creation is
 * excluded even when its featured flag is set (the exclusion lives in the
 * `listFeatured` query). The server-only `./server.ts` is dynamically imported
 * inside the handler so `getSql()` never enters the client bundle. This is the
 * curation row proper — distinct from `listLibraryFn`'s `sort: "featured"`,
 * which is a most-liked ordering, not the editorial mark.
 */
export const listFeaturedFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<LibraryItem[]> => {
    const { listFeatured } = await import("./server.ts");
    return listFeatured();
  },
);
