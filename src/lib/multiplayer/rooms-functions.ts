import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  createRoomSchema,
  roomCodeSchema,
  type MyRoom,
  type PersistentRoom,
  type RoomLookup,
} from "./rooms-types";

/**
 * Durable named rooms (Item 13). The server-only ./rooms-server.ts is imported
 * dynamically inside each handler so getSql() never reaches the client bundle,
 * matching the profiles/creations server-fn pattern.
 *
 * SSR caveat: import these functions DYNAMICALLY inside a route loader (never at
 * a route module's top level) to avoid the createSsrRpc circular-chunk 500.
 */

/** Authed: mint a named room owned by the caller and return it. */
export const createRoomFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => createRoomSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersistentRoom> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { createRoom } = await import("./rooms-server.ts");
    return createRoom(context.userId, data);
  });

/**
 * PUBLIC read: existence + name for a code so the join UI can label a known
 * persistent room. Unauthenticated on purpose (no login to join a shared room),
 * and PII-free — never the owner id.
 */
export const getRoomFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => roomCodeSchema.parse(input))
  .handler(async ({ data }): Promise<RoomLookup> => {
    const { getRoom } = await import("./rooms-server.ts");
    return getRoom(data.code);
  });

/** Authed: the caller's own rooms, so they can drop back into one they made. */
export const listMyRoomsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MyRoom[]> => {
    const { listMyRooms } = await import("./rooms-server.ts");
    return listMyRooms(context.userId);
  });
