import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { creationConfigSchema as CreationConfigSchema } from "../creations/types.ts";

/**
 * Pure unit tests for the seed-of-the-day generator (Item 7). No DB I/O — these
 * exercise the deterministic `seedForDate` directly, which is the property the
 * whole daily-challenge feature rests on: the SAME day always yields the SAME,
 * schema-valid, loadable config.
 *
 * ./types.ts transitively imports the `@/engine/types` and `@/lib/creations`
 * aliases, which only resolve once the shared glob loader is registered; a
 * static top-level import would be hoisted BEFORE register() runs. So — like
 * the sibling suites — the modules under test are imported dynamically inside a
 * before() hook, after the loader is active.
 */
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

let seedForDate: typeof import("./types.ts").seedForDate;
let dayKey: typeof import("./types.ts").dayKey;
let SEED_GENERATORS: typeof import("./types.ts").SEED_GENERATORS;
let creationConfigSchema: typeof CreationConfigSchema;
let PRO_GENERATORS: readonly string[];

before(async () => {
  const types = await import("./types.ts");
  seedForDate = types.seedForDate;
  dayKey = types.dayKey;
  SEED_GENERATORS = types.SEED_GENERATORS;
  creationConfigSchema = (await import("../creations/types.ts")).creationConfigSchema;
  PRO_GENERATORS = (await import("../../engine/types.ts")).PRO_GENERATORS;
});

describe("seedForDate — deterministic seed-of-the-day", () => {
  it("is deterministic: the same day always yields the same config", () => {
    const a = seedForDate("2026-02-14");
    const b = seedForDate("2026-02-14");
    const c = seedForDate(new Date("2026-02-14T18:30:00Z"));
    assert.deepEqual(a, b, "same date key → identical config");
    assert.deepEqual(a, c, "a Date on the same UTC day → identical config");
  });

  it("produces a schema-valid, complete CreationConfig", () => {
    const config = seedForDate("2026-07-01");
    const parsed = creationConfigSchema.safeParse(config);
    assert.equal(parsed.success, true, "seed config parses under creationConfigSchema");
    assert.deepEqual(parsed.success ? parsed.data : null, config, "config is already normalized");
    assert.ok(config.spawnCount >= 10_000 && config.spawnCount <= 90_000);
    assert.equal(config.speed, 1);
    assert.ok(
      typeof config.params.pointSize === "number" && Number.isFinite(config.params.pointSize),
    );
  });

  it("only ever picks a FREE (non-Pro) generator so anyone can load/remix it", () => {
    const pro = new Set(PRO_GENERATORS);
    for (let i = 0; i < 400; i++) {
      const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const kind = seedForDate(day).spawnKind;
      assert.ok(
        (SEED_GENERATORS as readonly string[]).includes(kind),
        `day ${day} picked ${kind}, which must be in SEED_GENERATORS`,
      );
      assert.ok(!pro.has(kind), `day ${day} picked Pro generator ${kind}`);
    }
  });

  it("different days generally differ (the hash spreads picks)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const cfg = seedForDate(day);
      seen.add(`${cfg.spawnKind}:${cfg.params.palette}:${cfg.spawnCount}`);
    }
    assert.ok(seen.size > 5, "distinct days should yield a variety of seeds");
  });

  it("dayKey normalizes Dates and strings to a UTC YYYY-MM-DD key", () => {
    assert.equal(dayKey(new Date("2026-03-09T23:59:59Z")), "2026-03-09");
    assert.equal(dayKey("2026-03-09"), "2026-03-09");
    assert.equal(dayKey("2026-03-09T05:00:00Z"), "2026-03-09");
  });
});
