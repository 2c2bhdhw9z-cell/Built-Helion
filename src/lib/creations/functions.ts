import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  deleteCreationSchema,
  libraryQuerySchema,
  saveCreationSchema,
  setPublicSchema,
  sharedCreationSchema,
  toggleLikeSchema,
  type CreationRow,
  type LibraryItem,
  type PublicCreation,
} from "./types.ts";

export const saveCreationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => saveCreationSchema.parse(input))
  .handler(async ({ data, context }): Promise<CreationRow> => {
    const { insertCreation } = await import("./server.ts");
    return insertCreation(context.userId, data.name, data.config);
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
    const { setCreationPublic } = await import("./server.ts");
    const ok = await setCreationPublic(context.userId, data.id, data.isPublic);
    return { ok };
  });

export const toggleLikeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => toggleLikeSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ liked: boolean; likeCount: number }> => {
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
