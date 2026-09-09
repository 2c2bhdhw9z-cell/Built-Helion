import { z } from "zod";

/**
 * DURABLE named rooms (Item 13). A room is the persistent naming/ownership
 * layer keyed by the same 6-char code the ephemeral WebRTC presence layer uses.
 * Everything here is PII-free: a room carries a code, a human name, and the
 * owner's user id (never an email or any auth field).
 */
export interface PersistentRoom {
  code: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

/** Public read result for a code — existence + name so the join UI can label it. */
export interface RoomLookup {
  found: boolean;
  code: string;
  name: string;
}

/** A room owned by the caller, for the "your rooms" re-entry list. */
export interface MyRoom {
  code: string;
  name: string;
  createdAt: string;
  lastActiveAt: string;
}

/** Room names are short, trimmed, and optional (empty = unnamed room). */
export const ROOM_NAME_MAX = 40;

export const createRoomSchema = z.object({
  name: z.string().trim().max(ROOM_NAME_MAX).default(""),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/** A code is 4-8 chars of the room alphabet (see normalizeRoomCode). */
export const roomCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,8}$/, "invalid room code"),
});

export type RoomCodeInput = z.infer<typeof roomCodeSchema>;
