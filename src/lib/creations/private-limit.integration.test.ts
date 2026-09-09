import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationConfig } from "./types.ts";
import type { LabParams } from "../../engine/types.ts";

// Real PGLite via the shared glob loader (same pattern as creations.test.ts).
// Exercises the SERVER-AUTHORITATIVE free-tier private-creation quota (Item 23):
// entitlement is re-derived from billing (migration 0005 subscriptions), never
// trusted from the client.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type CreationsTypes = typeof import("./types.ts");
type CreationsServer = typeof import("./server.ts");
type BillingServer = typeof import("../billing/server.ts");

let creationConfigSchema: CreationsTypes["creationConfigSchema"];
let server: CreationsServer;
let billing: BillingServer;
let DEFAULT_PARAMS: LabParams;
let canSavePrivateCreation: CreationsTypes["canSavePrivateCreation"];
let FREE_PRIVATE_CREATION_LIMIT: number;

before(async () => {
  const types = await import("./types.ts");
  creationConfigSchema = types.creationConfigSchema;
  canSavePrivateCreation = types.canSavePrivateCreation;
  FREE_PRIVATE_CREATION_LIMIT = types.FREE_PRIVATE_CREATION_LIMIT;
  server = await import("./server.ts");
  billing = await import("../billing/server.ts");
  DEFAULT_PARAMS = (await import("../../engine/types.ts")).DEFAULT_PARAMS;
});

const config = (): CreationConfig =>
  creationConfigSchema.parse({
    params: { ...DEFAULT_PARAMS },
    spawnKind: "galaxy",
    spawnCount: 1000,
    speed: 1,
    cap: 65536,
  });

/** Expire the auto-started trial so the user is a genuinely unentitled free user. */
async function makeFree(userId: string): Promise<void> {
  await billing.getOrCreateBilling(userId);
  const { getSql } = await import("../db.ts");
  const sql = await getSql();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await sql`
    update subscriptions set plan = 'free', trial_ends_at = ${past}
    where user_id = ${userId}
  `;
}

describe("canSavePrivateCreation (pure)", () => {
  it("entitled users are never limited", () => {
    assert.equal(canSavePrivateCreation(999, true), true);
  });
  it("free users are allowed up to (but not past) the limit", () => {
    assert.equal(canSavePrivateCreation(FREE_PRIVATE_CREATION_LIMIT - 1, false), true);
    assert.equal(canSavePrivateCreation(FREE_PRIVATE_CREATION_LIMIT, false), false);
    assert.equal(canSavePrivateCreation(FREE_PRIVATE_CREATION_LIMIT + 1, false), false);
  });
});

describe("private-save quota (real PGLite, migrations 0004/0005)", () => {
  it("blocks a free user's (limit+1)th private save", async () => {
    const user = "free-saver";
    await makeFree(user);
    const b = await billing.getOrCreateBilling(user);
    assert.equal(b.entitled, false);

    for (let i = 0; i < FREE_PRIVATE_CREATION_LIMIT; i++) {
      const r = await server.saveCreationGuarded(user, `draft ${i}`, config());
      assert.equal(r.status, "saved", `save ${i} should succeed`);
    }
    const overflow = await server.saveCreationGuarded(user, "one too many", config());
    assert.equal(overflow.status, "limit");
    assert.ok(overflow.status === "limit");
    assert.equal(overflow.limit, FREE_PRIVATE_CREATION_LIMIT);
  });

  it("publishing a draft frees a slot (public rows don't count)", async () => {
    const user = "free-publisher";
    await makeFree(user);
    const saved: string[] = [];
    for (let i = 0; i < FREE_PRIVATE_CREATION_LIMIT; i++) {
      const r = await server.saveCreationGuarded(user, `p ${i}`, config());
      assert.ok(r.status === "saved");
      saved.push(r.row.id);
    }
    // At the cap now.
    assert.equal((await server.saveCreationGuarded(user, "blocked", config())).status, "limit");
    // Publish one — it stops counting toward the private quota.
    await server.setCreationPublic(user, saved[0]!, true);
    const afterPublish = await server.saveCreationGuarded(user, "now ok", config());
    assert.equal(afterPublish.status, "saved");
  });

  it("an entitled (Pro) user has no private-save cap", async () => {
    const user = "pro-saver";
    await billing.choosePlan(user, "pro");
    for (let i = 0; i < FREE_PRIVATE_CREATION_LIMIT + 3; i++) {
      const r = await server.saveCreationGuarded(user, `pro ${i}`, config());
      assert.equal(r.status, "saved", `pro save ${i} should succeed`);
    }
  });
});
