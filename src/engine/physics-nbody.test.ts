import { describe, test, expect } from "vitest";
import { SpatialHash } from "./hash";
import { ParticleSoA } from "./soa";
import { stepPhysics } from "./physics";
import { DEFAULT_PARAMS, IDLE_EXTRA_BRUSH } from "./types";

const pointer = { x: 0, y: 0, down: false, inside: false };

function baseParams(over: Partial<typeof DEFAULT_PARAMS> = {}) {
  return {
    ...DEFAULT_PARAMS,
    gravityX: 0,
    gravityY: 0,
    drag: 0,
    centralMass: 0,
    collide: false,
    settle: false,
    flock: false,
    sph: false,
    nbody: false,
    flow: false,
    ...over,
  };
}

function stepN(soa: ParticleSoA, params: ReturnType<typeof baseParams>, n: number) {
  const hash = new SpatialHash();
  for (let s = 0; s < n; s++) {
    stepPhysics(
      soa,
      hash,
      params,
      pointer,
      "attract",
      0.12,
      0.85,
      [],
      1.6,
      1,
      1 / 60,
      0,
      0,
      0,
      [],
      IDLE_EXTRA_BRUSH,
    );
  }
}

describe("n-body", () => {
  test("pairwise: two masses attract", () => {
    const soa = new ParticleSoA(8);
    const a = soa.spawnSlot();
    const b = soa.spawnSlot();
    soa.writeParticle(a, 0.4, 0.5, 0, 0, -1, 3);
    soa.writeParticle(b, 1.2, 0.5, 0, 0, -1, 3);
    stepN(soa, baseParams({ nbody: true, nbodyG: 0.06, softening: 0.04 }), 24);
    expect(soa.posX[a]!).toBeGreaterThan(0.4);
    expect(soa.posX[b]!).toBeLessThan(1.2);
  });

  test("mass grid: far clumps still pull when n > 1600", () => {
    const soa = new ParticleSoA(1700);
    const a = soa.spawnSlot();
    const b = soa.spawnSlot();
    soa.writeParticle(a, 0.15, 0.5, 0, 0, -1, 8);
    soa.writeParticle(b, 1.45, 0.5, 0, 0, -1, 8);
    for (let i = 0; i < 1600; i++) {
      const s = soa.spawnSlot();
      soa.writeParticle(s, 0.8 + (i % 20) * 0.002, 0.12 + ((i / 20) | 0) * 0.002, 0, 0, -1, 0.0002);
    }
    expect(soa.count).toBeGreaterThan(1600);
    stepN(soa, baseParams({ nbody: true, nbodyG: 0.08, softening: 0.05 }), 18);
    expect(soa.posX[a]!).toBeGreaterThan(0.15);
    expect(soa.posX[b]!).toBeLessThan(1.45);
  });
});

describe("SPH cohesion", () => {
  test("pulls neighboring fluid together", () => {
    const soa = new ParticleSoA(8);
    const a = soa.spawnSlot();
    const b = soa.spawnSlot();
    soa.writeParticle(a, 0.78, 0.5, 0, 0, -1, 1);
    soa.writeParticle(b, 0.82, 0.5, 0, 0, -1, 1);
    stepN(
      soa,
      baseParams({
        sph: true,
        sphPressure: 0,
        sphViscosity: 0,
        sphCohesion: 1.1,
        sphSmoothing: 0.05,
        sphRestDensity: 8,
      }),
      20,
    );
    expect(Math.abs(soa.posX[b]! - soa.posX[a]!)).toBeLessThan(0.04);
  });
});
