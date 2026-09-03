import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type TeamsServer = typeof import("./server.ts");
type CreationsTypes = typeof import("../creations/types.ts");
type EngineTypes = typeof import("../../engine/types.ts");

let server: TeamsServer;
let creationConfigSchema: CreationsTypes["creationConfigSchema"];
let DEFAULT_PARAMS: EngineTypes["DEFAULT_PARAMS"];

before(async () => {
  server = await import("./server.ts");
  creationConfigSchema = (await import("../creations/types.ts")).creationConfigSchema;
  DEFAULT_PARAMS = (await import("../../engine/types.ts")).DEFAULT_PARAMS;
});

const scene = () =>
  creationConfigSchema.parse({
    params: { ...DEFAULT_PARAMS },
    spawnKind: "galaxy",
    spawnCount: 1000,
    speed: 1,
    cap: 65536,
  });

describe("teams (real PGLite, no seed rows)", () => {
  it("starts with no teams for a new user", async () => {
    const rows = await server.listMyTeams("nobody-yet");
    assert.deepEqual(rows, []);
  });

  it("create / join / members / shelf are real rows", async () => {
    const owner = "team-owner";
    const guest = "team-guest";
    const created = await server.createTeam(owner, "Studio");
    assert.equal(created.role, "owner");
    assert.equal(created.joinCode.length, 6);

    const joined = await server.joinTeam(guest, created.joinCode);
    assert.ok(joined);
    assert.equal(joined.name, "Studio");

    const members = await server.listMembers(owner, created.id);
    assert.equal(members.length, 2);
    assert.ok(members.some((m) => m.userId === owner && m.role === "owner"));
    assert.ok(members.some((m) => m.userId === guest));

    const emptyShelf = await server.listTeamLibrary(owner, created.id);
    assert.deepEqual(emptyShelf, []);

    const shared = await server.shareToTeam(guest, created.id, "Real scene", scene());
    assert.equal(shared, true);
    const shelf = await server.listTeamLibrary(owner, created.id);
    assert.equal(shelf.length, 1);
    assert.equal(shelf[0]?.name, "Real scene");
    assert.equal(shelf[0]?.author, "No name");

    const viewOnly = await server.setMemberRole(owner, created.id, guest, "view");
    assert.equal(viewOnly, true);
    const blocked = await server.shareToTeam(guest, created.id, "Nope", scene());
    assert.equal(blocked, false);

    const left = await server.leaveTeam(guest, created.id);
    assert.equal(left, true);
    const afterLeave = await server.listMembers(owner, created.id);
    assert.equal(afterLeave.length, 1);
  });
});
