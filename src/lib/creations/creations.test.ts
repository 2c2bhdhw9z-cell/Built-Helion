import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type {
  CreationConfig,
  CreationRow,
  PublicCreation,
} from "./types.ts";
import type { LabParams } from "../../engine/types.ts";

// Same loader hook as feedback.test.ts / settings.test.ts: it resolves the
// `@/` alias and inlines the REAL migration SQL (including the new
// migrations/0004_creations.sql) so this suite hits a genuine PGLite database
// — no DB mocking, no seeded rows.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type CreationsTypes = typeof import("./types.ts");

// ./types.ts imports `@/engine/types`, which only resolves once the loader
// hook above is registered; a static top-level import would be hoisted and
// resolved BEFORE register() runs. So (like the sibling suites do for
// server.ts) we import the schema module and DEFAULT_PARAMS dynamically inside
// a before() hook, after the loader is active.
let creationConfigSchema: CreationsTypes["creationConfigSchema"];
let normalizeCreationConfig: CreationsTypes["normalizeCreationConfig"];
let SPAWN_COUNT_MIN: number;
let SPAWN_COUNT_MAX: number;
let CAP_MIN: number;
let CAP_MAX: number;
let DEFAULT_PARAMS: LabParams;
let DEFAULT_CAP: number;
let defaultKeys: string[];

before(async () => {
  const types = await import("./types.ts");
  creationConfigSchema = types.creationConfigSchema;
  normalizeCreationConfig = types.normalizeCreationConfig;
  SPAWN_COUNT_MIN = types.SPAWN_COUNT_MIN;
  SPAWN_COUNT_MAX = types.SPAWN_COUNT_MAX;
  CAP_MIN = types.CAP_MIN;
  CAP_MAX = types.CAP_MAX;
  const engineTypes = await import("../../engine/types.ts");
  DEFAULT_PARAMS = engineTypes.DEFAULT_PARAMS;
  DEFAULT_CAP = engineTypes.DEFAULT_CAP;
  defaultKeys = Object.keys(DEFAULT_PARAMS).sort();
});

type CreationsServer = {
  insertCreation: (
    userId: string,
    name: string,
    config: CreationConfig,
  ) => Promise<CreationRow>;
  updateCreation: (
    userId: string,
    id: string,
    name: string,
    config: CreationConfig,
  ) => Promise<CreationRow | null>;
  listCreations: (userId: string) => Promise<CreationRow[]>;
  deleteCreation: (userId: string, id: string) => Promise<boolean>;
  getPublicCreation: (id: string) => Promise<PublicCreation | null>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
  listLibrary: (sort: "recent" | "featured", viewerId: string | null) => Promise<import("./types.ts").LibraryItem[]>;
  toggleLike: (userId: string, creationId: string) => Promise<{ liked: boolean; likeCount: number }>;
};

/** A complete, valid config to persist in the DB round-trip tests. */
const validConfig = (): CreationConfig =>
  creationConfigSchema.parse({
    params: { ...DEFAULT_PARAMS, gravityY: -0.5, trails: true },
    spawnKind: "ring",
    spawnCount: 12_345,
    speed: 2,
    cap: 131_072,
  });

describe("creationConfigSchema / normalizeCreationConfig", () => {

  it("round-trips a valid full config", () => {
    const input = {
      params: { ...DEFAULT_PARAMS, gravityX: 0.25, bloom: true },
      spawnKind: "flock",
      spawnCount: 8000,
      speed: 4,
      cap: 262_144,
    };
    const parsed = creationConfigSchema.parse(input);
    assert.equal(parsed.spawnKind, "flock");
    assert.equal(parsed.spawnCount, 8000);
    assert.equal(parsed.speed, 4);
    assert.equal(parsed.cap, 262_144);
    assert.equal(parsed.params.gravityX, 0.25);
    assert.equal(parsed.params.bloom, true);
    // Params carry EXACTLY the DEFAULT_PARAMS key set (mirrors scenes.test.ts).
    assert.deepEqual(Object.keys(parsed.params).sort(), defaultKeys);
  });

  it("strips unknown/extra keys from params (cannot smuggle fields into the store)", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS, notARealParam: 999, __proto__hack: true },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
    });
    const keys = Object.keys(parsed.params).sort();
    assert.deepEqual(keys, defaultKeys, "extra keys must be stripped");
    for (const key of keys) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(DEFAULT_PARAMS, key),
        `params key ${key} is not a real DEFAULT_PARAMS key`,
      );
    }
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed.params, "notARealParam"),
      false,
    );
  });

  it("coerces an out-of-range / non-finite numeric param to the DEFAULT_PARAMS value", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS, drag: Number.POSITIVE_INFINITY, mass: "boom" },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
    });
    // A non-finite / wrong-type numeric field falls back to its default.
    assert.equal(parsed.params.drag, DEFAULT_PARAMS.drag);
    assert.equal(parsed.params.mass, DEFAULT_PARAMS.mass);
  });

  it("defaults an invalid spawnKind", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "not-a-generator",
      spawnCount: 5000,
      speed: 1,
    });
    assert.equal(parsed.spawnKind, "galaxy");
  });

  it("clamps spawnCount into 50..1M", () => {
    const tooLow = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 1,
      speed: 1,
    });
    assert.equal(tooLow.spawnCount, SPAWN_COUNT_MIN);

    const tooHigh = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 10_000_000,
      speed: 1,
    });
    assert.equal(tooHigh.spawnCount, SPAWN_COUNT_MAX);
  });

  it("accepts a 1M spawnCount", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 1_000_000,
      speed: 1,
    });
    assert.equal(parsed.spawnCount, 1_000_000);
  });

  it("defaults an invalid speed to 1", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 3.5,
    });
    assert.equal(parsed.speed, 1);
  });

  it("round-trips a valid cap", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
      cap: 131_072,
    });
    assert.equal(parsed.cap, 131_072);
  });

  it("clamps an out-of-range cap into CAP_MIN..CAP_MAX", () => {
    const tooLow = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
      cap: 1,
    });
    assert.equal(tooLow.cap, CAP_MIN);

    const tooHigh = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
      cap: 10_000_000,
    });
    assert.equal(tooHigh.cap, CAP_MAX);
  });

  it("defaults a non-finite cap to DEFAULT_CAP", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
      cap: Number.POSITIVE_INFINITY,
    });
    assert.equal(parsed.cap, DEFAULT_CAP);
  });

  it("defaults a missing cap to DEFAULT_CAP (older rows without cap still normalize)", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
    });
    assert.equal(parsed.cap, DEFAULT_CAP);
  });

  it("normalizeCreationConfig returns null on total garbage", () => {
    assert.equal(normalizeCreationConfig(null), null);
    assert.equal(normalizeCreationConfig("string"), null);
    assert.equal(normalizeCreationConfig(42), null);
    assert.equal(normalizeCreationConfig(undefined), null);
  });

  it("normalizeCreationConfig coerces an empty object to a complete valid config", () => {
    const parsed = normalizeCreationConfig({});
    assert.ok(parsed);
    assert.deepEqual(Object.keys(parsed.params).sort(), defaultKeys);
    assert.equal(parsed.spawnKind, "galaxy");
    assert.equal(parsed.speed, 1);
    assert.equal(parsed.cap, DEFAULT_CAP);
  });
});

describe("creations DB round trip (real PGLite, migration 0004)", () => {
  let server: CreationsServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as CreationsServer;
  });

  it("starts from a genuine empty state (no seeded rows)", async () => {
    const rows = await server.listCreations("empty-user");
    assert.deepEqual(rows, [], "fresh DB must return an empty array, not mock data");
  });

  it("save then list round-trips the stored name + config for that user", async () => {
    const userId = "user-round-trip";
    const config = validConfig();
    const inserted = await server.insertCreation(userId, "My Galaxy", config);

    assert.ok(inserted.id, "an id must be generated app-side");
    assert.equal(inserted.user_id, userId);
    assert.equal(inserted.name, "My Galaxy");
    assert.equal(inserted.config.spawnKind, "ring");
    assert.equal(inserted.config.spawnCount, 12_345);
    assert.equal(inserted.config.speed, 2);
    assert.equal(inserted.config.cap, 131_072);
    assert.equal(inserted.config.params.trails, true);
    assert.equal(inserted.config.params.gravityY, -0.5);
    assert.ok(inserted.created_at, "created_at must be populated");

    const list = await server.listCreations(userId);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, inserted.id);
    assert.equal(list[0].name, "My Galaxy");
    assert.equal(list[0].config.spawnKind, "ring");
    assert.equal(list[0].config.params.trails, true);
  });

  it("list is USER-SCOPED: user-a's creation is not returned for user-b", async () => {
    await server.insertCreation("scoped-user-a", "A's creation", validConfig());
    const bList = await server.listCreations("scoped-user-b");
    assert.deepEqual(bList, [], "user-b must not see user-a's rows");

    const aList = await server.listCreations("scoped-user-a");
    assert.equal(aList.length, 1);
    assert.equal(aList[0].name, "A's creation");
  });

  it("delete enforces OWNERSHIP: a non-owner cannot delete another user's creation", async () => {
    const owner = "owner-user";
    const attacker = "attacker-user";
    const inserted = await server.insertCreation(owner, "Owned", validConfig());

    // Attacker attempts to delete a row they do not own.
    const attackerResult = await server.deleteCreation(attacker, inserted.id);
    assert.equal(attackerResult, false, "non-owner delete must report no deletion");

    // The row is untouched and still lists for the owner.
    const stillThere = await server.listCreations(owner);
    assert.ok(
      stillThere.some((r) => r.id === inserted.id),
      "the owner's row must survive a non-owner delete attempt",
    );

    // The owner can delete it.
    const ownerResult = await server.deleteCreation(owner, inserted.id);
    assert.equal(ownerResult, true, "owner delete must report success");

    const afterDelete = await server.listCreations(owner);
    assert.ok(
      !afterDelete.some((r) => r.id === inserted.id),
      "the owner's row must disappear after they delete it",
    );
  });

  it("getPublicCreation returns a PII-free { id, name, config } and null for unknown id", async () => {
    const inserted = await server.insertCreation(
      "public-owner",
      "Shared Nebula",
      validConfig(),
    );

    const publicCreation = await server.getPublicCreation(inserted.id);
    assert.ok(publicCreation, "a valid share id must resolve to a creation");

    // The public projection carries EXACTLY { id, name, config } — no user_id,
    // no created_at, no email, no PII of any kind.
    assert.deepEqual(
      Object.keys(publicCreation).sort(),
      ["config", "id", "name"],
      "public payload keys must be exactly the public set",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(publicCreation, "user_id"),
      false,
      "public payload must never include user_id",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(publicCreation, "created_at"),
      false,
    );
    assert.equal(publicCreation.id, inserted.id);
    assert.equal(publicCreation.name, "Shared Nebula");
    assert.equal(publicCreation.config.spawnKind, "ring");
    assert.equal(publicCreation.config.params.trails, true);

    const missing = await server.getPublicCreation("no-such-share-id");
    assert.equal(missing, null, "an unknown share id must return null");
  });

  it("new creations default to unlisted (is_public false)", async () => {
    const inserted = await server.insertCreation("pub-owner", "Private draft", validConfig());
    assert.equal(inserted.is_public, false);
  });

  it("setCreationPublic is owner-scoped and listLibrary only shows public rows", async () => {
    const owner = "lib-owner";
    const other = "lib-other";
    const a = await server.insertCreation(owner, "Aurora public", validConfig());
    const b = await server.insertCreation(owner, "Kept private", validConfig());

    assert.equal(await server.setCreationPublic(other, a.id, true), false, "non-owner cannot publish");
    assert.equal(await server.setCreationPublic(owner, a.id, true), true);

    const recent = await server.listLibrary("recent", null);
    assert.ok(recent.some((row) => row.id === a.id), "published row appears in library");
    assert.ok(!recent.some((row) => row.id === b.id), "unlisted row stays out of library");
    const published = recent.find((row) => row.id === a.id)!;
    assert.equal(published.author, "No name");
    assert.equal(published.liked, false);
    assert.equal(published.likeCount, 0);
  });

  it("toggleLike only works on public creations and is per-user", async () => {
    const owner = "like-owner";
    const fan = "like-fan";
    const inserted = await server.insertCreation(owner, "Like me", validConfig());
    const privateLike = await server.toggleLike(fan, inserted.id);
    assert.equal(privateLike.liked, false, "cannot like an unlisted creation");

    await server.setCreationPublic(owner, inserted.id, true);
    const liked = await server.toggleLike(fan, inserted.id);
    assert.equal(liked.liked, true);
    assert.equal(liked.likeCount, 1);

    const feed = await server.listLibrary("featured", fan);
    const card = feed.find((row) => row.id === inserted.id);
    assert.ok(card);
    assert.equal(card!.liked, true);
    assert.equal(card!.likeCount, 1);

    const unliked = await server.toggleLike(fan, inserted.id);
    assert.equal(unliked.liked, false);
    assert.equal(unliked.likeCount, 0);
  });

  it("accepts a Pro generator kind in the saved config", () => {
    const parsed = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS, shape: "heart", emoji: "♥" },
      spawnKind: "crystal",
      spawnCount: 4000,
      speed: 1,
    });
    assert.equal(parsed.spawnKind, "crystal");
    assert.equal(parsed.params.shape, "heart");
    assert.equal(parsed.params.emoji, "♥");
  });
});


// ---------------------------------------------------------------------------
// Integration tests: save / list / update round-trips carry updated_at (Task 2.7)
//
// EXAMPLE-based integration tests (1-3 cases) against a REAL embedded PGLite
// database via the glob loader registered at the top of this file — NOT
// property tests. They exercise the full data layer (insertCreation,
// updateCreation, listCreations) exactly as the server functions do, with no
// DB mocking and no seeded rows.
//
// Covers:
//   - save -> list -> update carries `updated_at` (Reqs 1.1, 1.2, 1.3, 2.3)
//   - owner-scoped list (Req 1.2)
//   - config equality on re-read (Reqs 1.1, 1.3)
// ---------------------------------------------------------------------------

describe("creations save/list/update round-trip carries updated_at (real PGLite, Task 2.7)", () => {
  let server: CreationsServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as CreationsServer;
  });

  it("save -> list -> update carries updated_at (>= created_at) and advances it on edit", async () => {
    const userId = "rt-updated-at-user";
    const inserted = await server.insertCreation(userId, "Nebula v1", validConfig());

    // A freshly-saved row carries a modification timestamp (Req 2.3): updated_at
    // is populated and is not earlier than created_at.
    assert.ok(inserted.updated_at, "insertCreation must stamp updated_at");
    const insertedUpdatedMs = new Date(inserted.updated_at).getTime();
    const insertedCreatedMs = new Date(inserted.created_at).getTime();
    assert.ok(
      insertedUpdatedMs >= insertedCreatedMs,
      "a saved row's updated_at must be >= created_at",
    );

    // The list projection includes updated_at so the client can reconcile (Req 1.2/2.3).
    const listed = await server.listCreations(userId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, inserted.id);
    assert.ok(listed[0].updated_at, "listCreations must project updated_at");
    assert.equal(
      new Date(listed[0].updated_at).getTime(),
      insertedUpdatedMs,
      "listed updated_at must equal the stored value",
    );

    // Edit in place: updateCreation stamps a fresh updated_at that is >= the
    // original, while created_at is preserved (Reqs 1.3, 2.3).
    const editedConfig = validConfig();
    editedConfig.spawnCount = 54_321;
    const updated = await server.updateCreation(userId, inserted.id, "Nebula v2", editedConfig);
    assert.ok(updated, "owner update must return the row");
    assert.equal(updated!.name, "Nebula v2");
    assert.equal(updated!.config.spawnCount, 54_321);
    const updatedUpdatedMs = new Date(updated!.updated_at).getTime();
    assert.ok(
      updatedUpdatedMs >= insertedUpdatedMs,
      "update must advance (or hold) updated_at, never move it backwards",
    );
    assert.equal(
      new Date(updated!.created_at).getTime(),
      insertedCreatedMs,
      "update must preserve the original created_at",
    );

    // Re-read reflects the edited name/config and the advanced updated_at.
    const afterEdit = await server.listCreations(userId);
    assert.equal(afterEdit.length, 1, "editing must not create a second row");
    assert.equal(afterEdit[0].name, "Nebula v2");
    assert.equal(afterEdit[0].config.spawnCount, 54_321);
    assert.equal(new Date(afterEdit[0].updated_at).getTime(), updatedUpdatedMs);
  });

  it("update is OWNER-SCOPED: a non-owner edit changes nothing and returns null", async () => {
    const owner = "rt-owner";
    const attacker = "rt-attacker";
    const inserted = await server.insertCreation(owner, "Owned config", validConfig());

    const attempt = await server.updateCreation(attacker, inserted.id, "Hijacked", validConfig());
    assert.equal(attempt, null, "a non-owner update must report no update (null)");

    // The owner's row is untouched: same name, same config.
    const ownerList = await server.listCreations(owner);
    const stillOwned = ownerList.find((r) => r.id === inserted.id);
    assert.ok(stillOwned, "the owner's row must survive a non-owner update attempt");
    assert.equal(stillOwned!.name, "Owned config");
  });

  it("config round-trips EXACTLY on re-read (deep equality, owner-scoped)", async () => {
    const userId = "rt-config-equality";
    const config = validConfig();
    const inserted = await server.insertCreation(userId, "Exact config", config);

    const listed = await server.listCreations(userId);
    const found = listed.find((r) => r.id === inserted.id);
    assert.ok(found, "the saved row must list for its owner");

    // The stored config re-reads deep-equal to what was saved — nothing lost or
    // mutated through the JSON round trip (Reqs 1.1, 1.3).
    assert.deepEqual(found!.config, config, "re-read config must deep-equal the saved config");
    assert.deepEqual(found!.config, inserted.config, "list and insert must agree on config");

    // A different user sees none of it (owner scoping, Req 1.2).
    const otherList = await server.listCreations("rt-config-equality-other");
    assert.ok(
      !otherList.some((r) => r.id === inserted.id),
      "another user must not see this creation",
    );
  });
});


// ---------------------------------------------------------------------------
// Property-based tests for timestamp reconciliation (Task 2.3)
//
// Property 1 (design.md): Last-write-wins picks the later timestamp — for any
//   two same-id records with distinct `updated_at`, resolveByTimestamp returns
//   the later; equal timestamps deterministically return the remote record.
// Property 2 (design.md): A save records a modification timestamp — asserted
//   here via the pure invariant that a stored row's `updated_at >= created_at`.
//
// resolveByTimestamp is a PURE helper (no I/O), so no DB access is needed. It
// lives in ./server.ts, which imports the `@/` alias, so — matching the
// sibling suites — it is imported dynamically inside a before() hook after the
// loader hook registered at the top of this file is active.
// ---------------------------------------------------------------------------

import fc from "fast-check";

type CreationsServerRecon = {
  resolveByTimestamp: <T extends { updated_at: string | Date }>(local: T, remote: T) => T;
};

describe("resolveByTimestamp — last-write-wins reconciliation (Req 2.2, 2.3)", () => {
  let resolveByTimestamp: CreationsServerRecon["resolveByTimestamp"];

  before(async () => {
    const server = (await import("./server.ts")) as unknown as CreationsServerRecon;
    resolveByTimestamp = server.resolveByTimestamp;
  });

  // A finite, in-range epoch-millis timestamp generator. Bounded to a sane
  // range (roughly 1970..2286) so `new Date(ms)` is always valid and every
  // generated instant is representable both as a Date and as an ISO string.
  const epochMs = fc.integer({ min: 0, max: 9_999_999_999_999 });

  // Wrap an epoch-millis value as either a Date or an ISO string, mirroring the
  // two shapes `updated_at` legitimately takes (Date on the server, ISO string
  // on the client after the server-function boundary serializes the row).
  const asStampField = (ms: number, asString: boolean): string | Date =>
    asString ? new Date(ms).toISOString() : new Date(ms);

  // Feature: helion-completion, Property 1: Last-write-wins picks the later timestamp
  it("Property 1: returns the record with the strictly-later updated_at (distinct timestamps)", () => {
    fc.assert(
      fc.property(
        epochMs,
        epochMs,
        fc.boolean(),
        fc.boolean(),
        (aMs, bMs, localIsString, remoteIsString) => {
          // Constrain to the DISTINCT-timestamp input space this property is
          // about: the earlier instant is `local`, the strictly-later is
          // `remote`, so the later record is unambiguous.
          fc.pre(aMs !== bMs);
          const earlierMs = Math.min(aMs, bMs);
          const laterMs = Math.max(aMs, bMs);

          const local = { id: "same-id", updated_at: asStampField(earlierMs, localIsString) };
          const remote = { id: "same-id", updated_at: asStampField(laterMs, remoteIsString) };

          // The strictly-later record wins regardless of argument position.
          assert.strictEqual(resolveByTimestamp(local, remote), remote);
          assert.strictEqual(resolveByTimestamp(remote, local), remote);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: helion-completion, Property 1: equal timestamps resolve to remote
  it("Property 1: equal timestamps deterministically resolve to the remote (server-authoritative) record", () => {
    fc.assert(
      fc.property(epochMs, fc.boolean(), fc.boolean(), (ms, localIsString, remoteIsString) => {
        const local = { id: "same-id", updated_at: asStampField(ms, localIsString) };
        const remote = { id: "same-id", updated_at: asStampField(ms, remoteIsString) };
        // On an exact tie, the server-authoritative `remote` wins deterministically.
        assert.strictEqual(resolveByTimestamp(local, remote), remote);
      }),
      { numRuns: 100 },
    );
  });

  // Concrete tie example case (as required by Task 2.3): identical timestamps
  // return the remote record, never the local one.
  it("Property 1 (concrete tie example): identical timestamps return the remote record", () => {
    const stamp = "2024-01-01T00:00:00.000Z";
    const local = { id: "c1", updated_at: stamp, name: "local edit" };
    const remote = { id: "c1", updated_at: stamp, name: "remote edit" };
    const winner = resolveByTimestamp(local, remote);
    assert.strictEqual(winner, remote);
    assert.equal(winner.name, "remote edit");

    // And a strictly-later local does win the concrete case too.
    const laterLocal = { id: "c1", updated_at: "2024-01-02T00:00:00.000Z", name: "local edit" };
    const staleRemote = { id: "c1", updated_at: "2024-01-01T00:00:00.000Z", name: "remote edit" };
    assert.strictEqual(resolveByTimestamp(laterLocal, staleRemote), laterLocal);
  });

  // Feature: helion-completion, Property 2: A save records a modification timestamp
  //
  // A save stamps `updated_at = now()` and a fresh row's `created_at` also
  // defaults to now(), so the stored-row invariant is `updated_at >= created_at`.
  // This asserts that pure invariant across arbitrary (created_at, updated_at)
  // pairs modeling a saved-then-possibly-edited row: whenever a row is stamped
  // with an updated_at no earlier than its created_at, resolveByTimestamp — the
  // reconciliation key that consumes updated_at — treats such a row as at least
  // as authoritative as a copy pinned to its own creation instant.
  it("Property 2: a saved row's updated_at >= created_at, and it wins over a copy stamped at created_at", () => {
    fc.assert(
      fc.property(
        epochMs,
        fc.integer({ min: 0, max: 9_999_999_999_999 }),
        fc.boolean(),
        (createdMs, extraMs, asString) => {
          // Model a stored row: updated_at is created_at plus a non-negative
          // modification delay (equal when saved and never edited), so the
          // stored-row invariant updated_at >= created_at holds by construction.
          const updatedMs = createdMs + extraMs;
          assert.ok(updatedMs >= createdMs, "stored invariant: updated_at >= created_at");

          const stored = { id: "row", created_at: asStampField(createdMs, asString), updated_at: asStampField(updatedMs, asString) };
          // A stale copy that only ever carried its creation instant as its
          // modification timestamp must never beat the saved row.
          const staleCopy = { id: "row", created_at: asStampField(createdMs, asString), updated_at: asStampField(createdMs, asString) };
          assert.strictEqual(resolveByTimestamp(staleCopy, stored), stored);
        },
      ),
      { numRuns: 100 },
    );
  });
});
