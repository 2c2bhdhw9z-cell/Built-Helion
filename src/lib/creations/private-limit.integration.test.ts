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

  // Race-safety: the guard is insert-then-recount-and-rollback, so even when
  // the pre-insert count is stale (the flaw a plain count-then-insert has) the
  // atomic recount must reject the row that overshoots. Concurrent saves are
  // hard to force deterministically headlessly, so we fire all limit+1 saves
  // in parallel (a stronger stand-in than a serialized boundary drive: their
  // count reads genuinely interleave) and assert the invariant that at most
  // FREE_PRIVATE_CREATION_LIMIT private rows ever stand and exactly one save is
  // rejected.
  it("concurrent (limit+1) private saves never overshoot the cap", async () => {
    const user = "race-saver";
    await makeFree(user);
    const b = await billing.getOrCreateBilling(user);
    assert.equal(b.entitled, false);

    const attempts = FREE_PRIVATE_CREATION_LIMIT + 1;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        server.saveCreationGuarded(user, `race ${i}`, config()),
      ),
    );

    const saved = results.filter((r) => r.status === "saved").length;
    const limited = results.filter((r) => r.status === "limit").length;
    // The invariant that matters: the stored private-row count never exceeds
    // the cap, regardless of how the concurrent count reads interleaved.
    const finalCount = await server.countPrivateCreations(user);
    assert.ok(
      finalCount <= FREE_PRIVATE_CREATION_LIMIT,
      `stored private rows (${finalCount}) must not exceed the cap`,
    );
    assert.equal(finalCount, FREE_PRIVATE_CREATION_LIMIT);
    assert.equal(saved, FREE_PRIVATE_CREATION_LIMIT);
    assert.equal(limited, 1);
  });

  // Serialized boundary drive: even with a deliberately STALE pre-insert count
  // (simulating a check that observed room when there was none), a save at the
  // exact cap is rolled back by the atomic recount. This drives the guard to
  // the boundary one row at a time and asserts the (limit+1)th is rejected.
  it("rejects a save driven to the exact boundary with a stale count", async () => {
    const user = "boundary-saver";
    await makeFree(user);
    for (let i = 0; i < FREE_PRIVATE_CREATION_LIMIT; i++) {
      const r = await server.saveCreationGuarded(user, `fill ${i}`, config());
      assert.equal(r.status, "saved");
    }
    // Pre-insert count would read exactly the cap; the atomic guard must reject.
    const overflow = await server.saveCreationGuarded(user, "over", config());
    assert.equal(overflow.status, "limit");
    assert.equal(await server.countPrivateCreations(user), FREE_PRIVATE_CREATION_LIMIT);
  });
});
