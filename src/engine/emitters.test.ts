import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnGenerator } from "./emitters.ts";
import { ParticleSoA } from "./soa.ts";
import { GENERATOR_KINDS, type GeneratorKind } from "./types.ts";
import { GENERATOR_PRESETS } from "./generator-presets.ts";

function opts(count = 400) {
  return {
    worldW: 1.6,
    worldH: 1,
    count,
    mass: 1,
    lifespan: 2,
    spread: 0.8,
    speed: 0.7,
    originX: 0.8,
    originY: 0.5,
    centralMass: 1.35,
    textInput: "HELION",
  };
}

describe("spawnGenerator catalog", () => {
  it("has a preset for every generator kind", () => {
    for (const kind of GENERATOR_KINDS) {
      assert.ok(GENERATOR_PRESETS[kind], `missing preset for ${kind}`);
    }
  });

  it("spawns a positive count for every generator kind", () => {
    for (const kind of GENERATOR_KINDS) {
      if (kind === "text") continue; // needs a canvas 2d context
      const soa = new ParticleSoA(8000);
      const result = spawnGenerator(kind, soa, opts(kind === "pour" ? 200 : 400));
      assert.ok(result.spawned > 0, `${kind} spawned ${result.spawned}`);
    }
  });

  it("fibonacci and sierpinski fill most of the requested budget", () => {
    for (const kind of ["fibonacci", "sierpinski"] as GeneratorKind[]) {
      const soa = new ParticleSoA(8000);
      const result = spawnGenerator(kind, soa, opts(800));
      assert.ok(result.spawned >= 720, `${kind} only spawned ${result.spawned}/800`);
    }
  });

  it("lightning lays particles along a bolt (not a single point)", () => {
    const soa = new ParticleSoA(8000);
    const result = spawnGenerator("lightning", soa, opts(600));
    assert.ok(result.spawned > 50);
    let minY = 99;
    let maxY = -99;
    for (let i = 0; i < soa.count; i++) {
      minY = Math.min(minY, soa.posY[i]!);
      maxY = Math.max(maxY, soa.posY[i]!);
    }
    assert.ok(maxY - minY > 0.2, `lightning vertical span ${maxY - minY}`);
  });
});
