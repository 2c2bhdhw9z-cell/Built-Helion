import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type TeamsServer = typeof import("./server.ts");
type CreationsTypes = typeof import("../creations/types.ts");
type EngineTypes = typeof import("../../engine/types.ts");
type BillingServer = typeof import("../billing/server.ts");
type TeamsTypes = typeof import("./types.ts");

let server: TeamsServer;
let billing: BillingServer;
let creationConfigSchema: CreationsTypes["creationConfigSchema"];
let DEFAULT_PARAMS: EngineTypes["DEFAULT_PARAMS"];
let canAddSeat: TeamsTypes["canAddSeat"];
let canCreateTeam: TeamsTypes["canCreateTeam"];
let seatLimit: TeamsTypes["seatLimit"];
let PRO_SEAT_LIMIT: number;
let ENTERPRISE_SEAT_LIMIT: number;

before(async () => {
  server = await import("./server.ts");
  billing = await import("../billing/server.ts");
  const types = await import("./types.ts");
  canAddSeat = types.canAddSeat;
  canCreateTeam = types.canCreateTeam;
  seatLimit = types.seatLimit;
  PRO_SEAT_LIMIT = types.PRO_SEAT_LIMIT;
  ENTERPRISE_SEAT_LIMIT = types.ENTERPRISE_SEAT_LIMIT;
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

/** A user whose owner-side billing is entitled (Pro) so they can own a team. */
async function entitledUser(id: string): Promise<string> {
  await billing.choosePlan(id, "pro");
  return id;
}

describe("teams plan/seat gating (pure)", () => {
  it("unentitled owners get zero seats and cannot create a team", () => {
    assert.equal(seatLimit("free", false), 0);
    assert.equal(canCreateTeam("free", false), false);
  });

  it("pro (or trial) is a small studio; enterprise is a large org", () => {
    assert.equal(seatLimit("pro", true), PRO_SEAT_LIMIT);
    assert.equal(seatLimit("free", true), PRO_SEAT_LIMIT); // active trial
    assert.equal(seatLimit("enterprise", true), ENTERPRISE_SEAT_LIMIT);
    assert.equal(canCreateTeam("pro", true), true);
  });

  it("canAddSeat blocks at the plan limit", () => {
    assert.equal(canAddSeat(PRO_SEAT_LIMIT - 1, "pro", true), true);
    assert.equal(canAddSeat(PRO_SEAT_LIMIT, "pro", true), false);
    assert.equal(canAddSeat(0, "free", false), false);
  });
});

describe("teams (real PGLite, no seed rows)", () => {
  it("starts with no teams for a new user", async () => {
    const rows = await server.listMyTeams("nobody-yet");
    assert.deepEqual(rows, []);
  });

  it("an unentitled owner cannot create a team (plan-gated)", async () => {
    // A first visit auto-starts a 7-day trial (entitled). Expire it directly so
    // the owner is a genuinely unentitled free user, then confirm the server
    // refuses to create a team with a `plan` status.
    await billing.getOrCreateBilling("broke-owner");
    const { getSql } = await import("../db.ts");
    const sql = await getSql();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await sql`
      update subscriptions set plan = 'free', trial_ends_at = ${past}
      where user_id = ${"broke-owner"}
    `;
    const b = await billing.getOrCreateBilling("broke-owner");
    assert.equal(b.entitled, false);
    const result = await server.createTeam("broke-owner", "Nope");
    assert.equal(result.status, "plan");
  });

  it("create / join / members / shelf are real rows (entitled owner)", async () => {
    const owner = await entitledUser("team-owner");
    const guest = "team-guest";
    const created = await server.createTeam(owner, "Studio");
    assert.equal(created.status, "created");
    assert.ok(created.status === "created");
    assert.equal(created.team.role, "owner");
    assert.equal(created.team.joinCode.length, 6);
    const teamId = created.team.id;

    const joined = await server.joinTeam(guest, created.team.joinCode);
    assert.equal(joined.status, "joined");
    assert.ok(joined.status === "joined");
    assert.equal(joined.team.name, "Studio");

    const members = await server.listMembers(owner, teamId);
    assert.equal(members.length, 2);
    assert.ok(members.some((m) => m.userId === owner && m.role === "owner"));
    assert.ok(members.some((m) => m.userId === guest));

    const emptyShelf = await server.listTeamLibrary(owner, teamId);
    assert.deepEqual(emptyShelf, []);

    const shared = await server.shareToTeam(guest, teamId, "Real scene", scene());
    assert.equal(shared, true);
    const shelf = await server.listTeamLibrary(owner, teamId);
    assert.equal(shelf.length, 1);
    assert.equal(shelf[0]?.name, "Real scene");
    assert.equal(shelf[0]?.author, "No name");

    // A NON-MEMBER cannot read the private team gallery, and cannot share.
    const stranger = "team-stranger";
    const strangerView = await server.listTeamLibrary(stranger, teamId);
    assert.deepEqual(strangerView, []);
    const strangerShare = await server.shareToTeam(stranger, teamId, "Sneaky", scene());
    assert.equal(strangerShare, false);
    const strangerMembers = await server.listMembers(stranger, teamId);
    assert.deepEqual(strangerMembers, []);

    // A "view" member can browse but not share or delete.
    const viewOnly = await server.setMemberRole(owner, teamId, guest, "view");
    assert.equal(viewOnly, true);
    const blocked = await server.shareToTeam(guest, teamId, "Nope", scene());
    assert.equal(blocked, false);

    // Owner-only actions reject a non-owner.
    const nonOwnerRole = await server.setMemberRole(guest, teamId, owner, "view");
    assert.equal(nonOwnerRole, false);
    const nonOwnerKick = await server.kickMember(guest, teamId, owner);
    assert.equal(nonOwnerKick, false);

    const left = await server.leaveTeam(guest, teamId);
    assert.equal(left, true);
    const afterLeave = await server.listMembers(owner, teamId);
    assert.equal(afterLeave.length, 1);
  });

  it("enforces the owner-plan seat limit on join", async () => {
    // Pro owner => PRO_SEAT_LIMIT seats total (owner counts as one).
    const owner = await entitledUser("seat-owner");
    const created = await server.createTeam(owner, "Small studio");
    assert.ok(created.status === "created");
    const code = created.team.joinCode;
    const limit = PRO_SEAT_LIMIT;

    // Fill the remaining seats.
    for (let i = 0; i < limit - 1; i++) {
      const r = await server.joinTeam(`seat-guest-${i}`, code);
      assert.equal(r.status, "joined", `guest ${i} should join`);
    }
    // The next join exceeds the seat limit.
    const overflow = await server.joinTeam("seat-overflow", code);
    assert.equal(overflow.status, "full");
    assert.ok(overflow.status === "full");
    assert.equal(overflow.limit, limit);

    // An existing member re-joining is idempotent and never rejected.
    const rejoin = await server.joinTeam("seat-guest-0", code);
    assert.equal(rejoin.status, "joined");
  });

  it("bad join code returns notfound", async () => {
    const r = await server.joinTeam("who", "ZZZZZZ");
    assert.equal(r.status, "notfound");
  });
});
