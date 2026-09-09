import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationConfig, CreationRow } from "./types.ts";
import type { LabParams } from "../../engine/types.ts";

// Real PGLite via the shared glob loader (same pattern as creations.test.ts).
// Inlines the REAL migrations, including migrations/0011_creation_lineage.sql,
// so the parent_id column and index actually exist for this suite.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type CreationsTypes = typeof import("./types.ts");

let creationConfigSchema: CreationsTypes["creationConfigSchema"];
let DEFAULT_PARAMS: LabParams;

before(async () => {
  const types = await import("./types.ts");
  creationConfigSchema = types.creationConfigSchema;
  const engineTypes = await import("../../engine/types.ts");
  DEFAULT_PARAMS = engineTypes.DEFAULT_PARAMS;
});

type ForkServer = {
  insertCreation: (userId: string, name: string, config: CreationConfig) => Promise<CreationRow>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
  forkCreation: (userId: string, sourceId: string) => Promise<CreationRow | null>;
  listCreations: (userId: string) => Promise<CreationRow[]>;
};

const validConfig = (): CreationConfig =>
  creationConfigSchema.parse({
    params: { ...DEFAULT_PARAMS, gravityY: -0.5, trails: true },
    spawnKind: "ring",
    spawnCount: 4321,
    speed: 2,
    cap: 131_072,
  });

describe("fork/remix (real PGLite, migration 0011)", () => {
  let server: ForkServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as ForkServer;
  });

  it("forking a PUBLIC creation yields a new owner-scoped row with parent_id + copied config", async () => {
    const author = "fork-author";
    const remixer = "fork-remixer";
    const source = await server.insertCreation(author, "Original Nebula", validConfig());
    assert.equal(await server.setCreationPublic(author, source.id, true), true);

    const forked = await server.forkCreation(remixer, source.id);
    assert.ok(forked, "forking a public creation must succeed");
    assert.notEqual(forked!.id, source.id, "fork gets a new id");
    assert.equal(forked!.user_id, remixer, "fork is owned by the caller");
    assert.equal(forked!.parent_id, source.id, "parent_id points at the source");
    assert.equal(forked!.parent_name, "Original Nebula", "public parent name is surfaced");
    assert.equal(forked!.is_public, false, "a remix starts unlisted");
    // Config is copied verbatim.
    assert.equal(forked!.config.spawnKind, "ring");
    assert.equal(forked!.config.spawnCount, 4321);
    assert.equal(forked!.config.params.trails, true);
    assert.equal(forked!.config.params.gravityY, -0.5);

    // It appears in the remixer's own creations, not the author's.
    const remixerList = await server.listCreations(remixer);
    assert.ok(remixerList.some((r) => r.id === forked!.id));
    const authorList = await server.listCreations(author);
    assert.ok(!authorList.some((r) => r.id === forked!.id));
  });

  it("forking a PRIVATE creation you don't own is denied", async () => {
    const author = "priv-author";
    const attacker = "priv-attacker";
    const source = await server.insertCreation(author, "Secret", validConfig());
    // source stays unlisted (is_public defaults to false).

    const forked = await server.forkCreation(attacker, source.id);
    assert.equal(forked, null, "a non-public source cannot be forked");

    const attackerList = await server.listCreations(attacker);
    assert.equal(attackerList.length, 0, "no row is created for a denied fork");
  });

  it("forking an unknown source id returns null", async () => {
    const forked = await server.forkCreation("nobody", "no-such-id");
    assert.equal(forked, null);
  });
});
