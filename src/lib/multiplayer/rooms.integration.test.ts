import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MyRoom, PersistentRoom, RoomLookup } from "./rooms-types.ts";

// Same PGLite glob-loader hook as the sibling suites: resolves the `@/` alias
// and inlines the REAL migration SQL (0013_rooms for the durable `rooms`
// table), so this suite hits a genuine PGLite database — no DB mocking.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type RoomsServer = {
  createRoom: (ownerId: string, input: { name: string }) => Promise<PersistentRoom>;
  getRoom: (code: string) => Promise<RoomLookup>;
  listMyRooms: (ownerId: string) => Promise<MyRoom[]>;
  touchRoom: (ownerId: string, code: string) => Promise<void>;
};

let rooms: RoomsServer;

before(async () => {
  rooms = (await import("./rooms-server.ts")) as unknown as RoomsServer;
});

describe("persistent named rooms — real PGLite (Item 13)", () => {
  it("create a named room, then getRoom returns its name by code", async () => {
    const owner = "room-owner-1";
    const created = await rooms.createRoom(owner, { name: "Nebula Lab" });
    assert.equal(created.name, "Nebula Lab");
    assert.equal(created.ownerId, owner);
    assert.match(created.code, /^[A-Z0-9]{4,8}$/);

    const lookup = await rooms.getRoom(created.code);
    assert.equal(lookup.found, true);
    assert.equal(lookup.name, "Nebula Lab");
    assert.equal(lookup.code, created.code);

    // getRoom is PII-free: no owner id anywhere in the serialized result.
    assert.ok(!JSON.stringify(lookup).includes(owner), "getRoom must not leak the owner id");
  });

  it("an unknown code is not found and carries an empty name", async () => {
    const lookup = await rooms.getRoom("ZZZZZZ");
    assert.equal(lookup.found, false);
    assert.equal(lookup.name, "");
    assert.equal(lookup.code, "ZZZZZZ");
  });

  it("a room persists across everyone leaving (durable, unlike the peer roster)", async () => {
    // There is no membership to leave here — the row simply exists after
    // creation regardless of any live presence. A later read still finds it.
    const created = await rooms.createRoom("room-owner-2", { name: "Persistent" });
    const again = await rooms.getRoom(created.code);
    assert.equal(again.found, true);
    assert.equal(again.name, "Persistent");
  });

  it("listMyRooms is owner-scoped and most-recently-active first", async () => {
    const mine = "room-owner-3";
    const other = "room-owner-4";
    const a = await rooms.createRoom(mine, { name: "Alpha" });
    const b = await rooms.createRoom(mine, { name: "Beta" });
    await rooms.createRoom(other, { name: "NotMine" });

    // Bump A so it ranks ahead of B despite being created first.
    await rooms.touchRoom(mine, a.code);

    const list = await rooms.listMyRooms(mine);
    const codes = list.map((r) => r.code);
    assert.ok(codes.includes(a.code) && codes.includes(b.code));
    assert.ok(!list.some((r) => r.name === "NotMine"), "must not include another owner's room");
    assert.equal(list[0].code, a.code, "the just-touched room ranks first");

    const otherList = await rooms.listMyRooms(other);
    assert.equal(otherList.length, 1);
    assert.equal(otherList[0].name, "NotMine");
  });

  it("codes are unique across many creations (collision handling holds)", async () => {
    const owner = "room-owner-5";
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const room = await rooms.createRoom(owner, { name: `R${i}` });
      assert.ok(!seen.has(room.code), "every minted code is unique");
      seen.add(room.code);
    }
  });
});
