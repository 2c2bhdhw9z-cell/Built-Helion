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

  it("crystal / helix / mandala / molecule are not galaxies", () => {
    for (const kind of ["crystal", "helix", "mandala", "molecule"] as GeneratorKind[]) {
      const preset = GENERATOR_PRESETS[kind];
      assert.equal(preset.nbody ?? false, false, `${kind} must not enable n-body`);
      assert.equal(preset.centralMass ?? 0, 0, `${kind} must not have a central mass`);
    }
  });

  it("helix is a tall double strand, not a disk", () => {
    const soa = new ParticleSoA(8000);
    const result = spawnGenerator("helix", soa, opts(800));
    assert.ok(result.spawned > 200);
    let minY = 99;
    let maxY = -99;
    let minX = 99;
    let maxX = -99;
    let sx = 0;
    for (let i = 0; i < soa.count; i++) {
      minY = Math.min(minY, soa.posY[i]!);
      maxY = Math.max(maxY, soa.posY[i]!);
      minX = Math.min(minX, soa.posX[i]!);
      maxX = Math.max(maxX, soa.posX[i]!);
      sx += soa.posX[i]!;
    }
    const meanX = sx / soa.count;
    assert.ok(maxY - minY > 0.55, `helix height ${maxY - minY}`);
    assert.ok(maxX - minX > 0.2 && maxX - minX < 1.1, `helix width ${maxX - minX}`);
    assert.ok(Math.abs(meanX - 0.8) < 0.25, `helix should sit on the vertical axis, meanX=${meanX}`);
    assert.ok(result.springs.length > 8, `helix rungs ${result.springs.length}`);
  });

  it("mandala has 8-fold petals, not spiral arms", () => {
    const soa = new ParticleSoA(8000);
    spawnGenerator("mandala", soa, opts(900));
    const cx = 0.8;
    const cy = 0.5;
    let peak = 0;
    let trough = 0;
    let pc = 0;
    let tc = 0;
    for (let i = 0; i < soa.count; i++) {
      const dx = soa.posX[i]! - cx;
      const dy = soa.posY[i]! - cy;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      const rose = Math.abs(Math.cos(4 * th));
      if (rose > 0.7) {
        peak += r;
        pc++;
      } else if (rose < 0.3) {
        trough += r;
        tc++;
      }
    }
    assert.ok(pc > 20 && tc > 10, `petal bins pc=${pc} tc=${tc}`);
    assert.ok(peak / pc > trough / tc, `petals should stick out (peak ${peak / pc} trough ${trough / tc})`);
  });

  it("molecule is bonded clusters, not a lattice", () => {
    const soa = new ParticleSoA(8000);
    const result = spawnGenerator("molecule", soa, opts(400));
    assert.ok(result.spawned > 30);
    assert.ok(result.springs.length >= 12, `molecule bonds ${result.springs.length}`);
  });

  it("crystal is faceted shards, not a filled sheet", () => {
    const soa = new ParticleSoA(8000);
    spawnGenerator("crystal", soa, opts(800));
    const cols = 16;
    const rows = 10;
    const occ = new Uint8Array(cols * rows);
    for (let i = 0; i < soa.count; i++) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor((soa.posX[i]! / 1.6) * cols)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(soa.posY[i]! * rows)));
      occ[cy * cols + cx] = 1;
    }
    let filled = 0;
    for (let i = 0; i < occ.length; i++) filled += occ[i]!;
    assert.ok(filled < occ.length * 0.72, `crystal occupied ${filled}/${occ.length} cells — too sheet-like`);
    assert.ok(filled > 8, `crystal occupied only ${filled} cells`);
  });
});
