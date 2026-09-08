import { test, expect, describe } from "vitest";
import { SpatialHash } from "./hash";
import { ParticleSoA } from "./soa";
import { stepPhysics } from "./physics";
import { DEFAULT_PARAMS, IDLE_EXTRA_BRUSH, type Spring } from "./types";

// Testing theoretical physics functions simulating what's in WGSL/JS physics
describe("Physics Boundaries & Restitution", () => {
  // A mock reflection function based on bounce logic
  function reflect(pos: number, vel: number, limit: number, rest: number): [number, number] {
    if (pos > limit) {
      return [limit, -Math.abs(vel) * rest];
    }
    if (pos < 0) {
      return [0, Math.abs(vel) * rest];
    }
    return [pos, vel];
  }

  test("Reflects correctly off positive boundary", () => {
    const [p, v] = reflect(1.2, 0.5, 1.0, 0.5);
    expect(p).toBe(1.0);
    expect(v).toBe(-0.25);
  });

  test("Reflects correctly off negative boundary", () => {
    const [p, v] = reflect(-0.2, -0.5, 1.0, 0.8);
    expect(p).toBe(0.0);
    expect(v).toBe(0.4);
  });

  test("No reflection when inside bounds", () => {
    const [p, v] = reflect(0.5, 0.5, 1.0, 1.0);
    expect(p).toBe(0.5);
    expect(v).toBe(0.5);
  });
});

describe("Grid Hash & SPH Setup", () => {
  function getCell(x: number, y: number, cellH: number): number {
    const cx = Math.max(0, Math.min(127, Math.floor(x / cellH)));
    const cy = Math.max(0, Math.min(127, Math.floor(y / cellH)));
    return cy * 128 + cx;
  }
  
  test("Calculates correct grid cell", () => {
    expect(getCell(0.05, 0.05, 0.1)).toBe(0);
    expect(getCell(0.15, 0.05, 0.1)).toBe(1);
    expect(getCell(0.05, 0.15, 0.1)).toBe(128);
  });
  
  test("Clamps correctly to boundaries", () => {
    expect(getCell(-0.1, -0.1, 0.1)).toBe(0);
    expect(getCell(20.0, 20.0, 0.1)).toBe(127 * 128 + 127);
  });
});

describe("Drag & Gravity Euler Integration", () => {
  function eulerStep(v: number, acc: number, dt: number, drag: number): number {
    let nextV = v + acc * dt;
    nextV -= nextV * drag * dt;
    return nextV;
  }
  
  test("Applies gravity correctly", () => {
    expect(eulerStep(0, 9.8, 1/60, 0)).toBeCloseTo(0.1633);
  });
  
  test("Applies drag correctly", () => {
    const v = eulerStep(10, 0, 1/60, 0.1);
    expect(v).toBeLessThan(10);
    expect(v).toBeCloseTo(9.983);
  });
});

describe("Extra session brush", () => {
  const pointer = { x: 0, y: 0, down: false, inside: false };
  const params = { ...DEFAULT_PARAMS, drag: 0, gravityX: 0, gravityY: 0, centralMass: 0 };

  function stepN(extra: typeof IDLE_EXTRA_BRUSH, n = 12) {
    const soa = new ParticleSoA(8);
    const i = soa.spawnSlot();
    soa.writeParticle(i, 0.5, 0.5, 0, 0, -1, 1);
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
        extra,
      );
    }
    return soa;
  }

  test("idle extra brush leaves a particle still", () => {
    const soa = stepN(IDLE_EXTRA_BRUSH, 8);
    expect(soa.posX[0]!).toBeCloseTo(0.5, 5);
    expect(soa.posY[0]!).toBeCloseTo(0.5, 5);
  });

  test("remote attract pulls toward the extra pointer", () => {
    const soa = stepN({ x: 0.8, y: 0.5, force: 0.9, radius: 0.4, mode: 1 }, 18);
    expect(soa.posX[0]!).toBeGreaterThan(0.5);
  });

  test("remote repel pushes away from the extra pointer", () => {
    const soa = stepN({ x: 0.8, y: 0.5, force: 0.9, radius: 0.4, mode: 2 }, 18);
    expect(soa.posX[0]!).toBeLessThan(0.5);
  });
});

describe("Spring compaction when a bonded particle dies", () => {
  const pointer = { x: 0, y: 0, down: false, inside: false };

  // Bonded particles normally have infinite life, but boundary:"destroy" (or a
  // NaN blow-up) can still kill one. compactDead swaps the last particle into
  // the dead slot; the spring list must drop bonds to the dead particle and
  // retarget bonds that referenced the moved (last) particle — never silently
  // reattach a dead particle's bond to the unrelated particle swapped in.
  test("dead particle's springs are dropped, moved particle's are retargeted", () => {
    const soa = new ParticleSoA(8);
    // 0: safely in-bounds, bonded to 1
    // 1: will leave bounds and be destroyed
    // 2: safely in-bounds, bonded to by 3
    // 3: safely in-bounds (the "last" particle that swaps into dead slot 1);
    //    its bond to 2 must be retargeted from index 3 -> index 1
    const a = soa.spawnSlot();
    const b = soa.spawnSlot();
    const c = soa.spawnSlot();
    const d = soa.spawnSlot();
    soa.writeParticle(a, 0.5, 0.5, 0, 0, -1, 1);
    // give particle b a large positive x velocity so it exits the right wall
    soa.writeParticle(b, 0.9, 0.5, 100, 0, -1, 1);
    soa.writeParticle(c, 0.3, 0.5, 0, 0, -1, 1);
    soa.writeParticle(d, 0.7, 0.5, 0, 0, -1, 1);

    const springs: Spring[] = [
      { a, b, rest: 0.1, k: 0.5 }, // bond to the doomed particle -> must be dropped
      { a: d, b: c, rest: 0.1, k: 0.5 }, // d is "last"; its bond must retarget to slot 1
    ];

    const params = {
      ...DEFAULT_PARAMS,
      gravityX: 0,
      gravityY: 0,
      drag: 0,
      centralMass: 0,
      collide: false,
      settle: false,
      flock: false,
      sph: false,
      boundary: "destroy" as const,
    };
    const hash = new SpatialHash();

    stepPhysics(
      soa,
      hash,
      params,
      pointer,
      "attract",
      0.12,
      0.85,
      springs,
      1,
      1,
      1 / 60,
      0,
      0,
      0,
      [],
      IDLE_EXTRA_BRUSH,
    );

    // Particle b was destroyed: count drops from 4 to 3.
    expect(soa.count).toBe(3);
    // The bond to the destroyed particle must be gone.
    expect(springs.some((s) => s.a === a && s.rest === 0.1 && s.k === 0.5 && (s.b === 3 || s.b === 1))).toBe(false);
    // Exactly one spring should remain: the d<->c bond, retargeted onto the
    // slot the moved particle now occupies. Every surviving spring must point at
    // live, in-range slots.
    expect(springs.length).toBe(1);
    for (const s of springs) {
      expect(s.a).toBeLessThan(soa.count);
      expect(s.b).toBeLessThan(soa.count);
      expect(s.a).toBeGreaterThanOrEqual(0);
      expect(s.b).toBeGreaterThanOrEqual(0);
      expect(s.a).not.toBe(s.b);
    }
  });
});
