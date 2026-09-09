import { getSql } from "@/lib/db";
import type { CreateRoomInput, MyRoom, PersistentRoom, RoomLookup } from "./rooms-types";

type RoomRow = {
  code: string;
  name: string;
  owner_id: string;
  created_at: string;
};

// Same code alphabet the client uses (protocol.ts ALPH): no ambiguous 0/1/I/L/O.
// Inlined here so this server-only module stays free of protocol.ts's client
// import graph (engine/creations types) — the two must agree on the alphabet
// and the normalizeRoomCode regex (roomCodeSchema), which they do.
const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generate a 6-char room code from the shared, unambiguous alphabet. */
function randomRoomCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  return out;
}

/** How many fresh codes to try before giving up on a (vanishingly rare) collision run. */
const MAX_CODE_ATTEMPTS = 8;

/**
 * Mint a durable, named room owned by `ownerId` (Item 13). The 6-char code is
 * generated client-alphabet-compatible via `randomRoomCode`; on the astronomically
 * unlikely event of a primary-key collision we retry with a fresh code up to
 * MAX_CODE_ATTEMPTS times. Persists independently of the ephemeral presence
 * roster, so the room can be re-entered after everyone leaves.
 */
export async function createRoom(
  ownerId: string,
  input: CreateRoomInput,
): Promise<PersistentRoom> {
  const sql = await getSql();
  const name = input.name.trim().slice(0, 40);
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = randomRoomCode();
    // ON CONFLICT DO NOTHING + RETURNING lets us detect a collision (no row
    // returned) and retry with a fresh code without a separate existence probe.
    const rows = await sql<RoomRow>`
      insert into rooms (code, name, owner_id)
      values (${code}, ${name}, ${ownerId})
      on conflict (code) do nothing
      returning code, name, owner_id, created_at
    `;
    const row = rows[0];
    if (row) {
      return {
        code: row.code,
        name: row.name,
        ownerId: row.owner_id,
        createdAt: row.created_at,
      };
    }
  }
  throw new Error("could not allocate a unique room code");
}

/**
 * PUBLIC read of a code (Item 13): existence + name so the join UI can show the
 * room's name before anyone connects. PII-free — never returns the owner id or
 * any private field. An unknown code degrades to `found: false`.
 */
export async function getRoom(code: string): Promise<RoomLookup> {
  const sql = await getSql();
  const rows = await sql<{ name: string }>`
    select name from rooms where code = ${code}
  `;
  const row = rows[0];
  return {
    found: Boolean(row),
    code,
    name: row?.name ?? "",
  };
}

/**
 * The caller's own rooms (Item 13), owner-scoped, most-recently-active first,
 * so they can drop back into a room they made. Never returns other users' rooms.
 */
export async function listMyRooms(ownerId: string): Promise<MyRoom[]> {
  const sql = await getSql();
  const rows = await sql<{
    code: string;
    name: string;
    created_at: string;
    last_active_at: string;
  }>`
    select code, name, created_at, last_active_at
    from rooms
    where owner_id = ${ownerId}
    order by last_active_at desc
    limit 24
  `;
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
  }));
}

/**
 * Bump a room's activity timestamp (owner-scoped) so the "your rooms" list
 * ranks recently-used rooms first. Best-effort — a no-op for an unknown code or
 * a room the caller does not own.
 */
export async function touchRoom(ownerId: string, code: string): Promise<void> {
  const sql = await getSql();
  await sql`
    update rooms set last_active_at = now()
    where code = ${code} and owner_id = ${ownerId}
  `;
}
