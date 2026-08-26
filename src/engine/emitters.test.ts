import { test, expect, describe } from "vitest";
import { 
  spawnGalaxy, 
  spawnRing, 
  spawnBurst, 
  spawnPourBurst, 
  spawnFallBurst, 
  spawnFlock, 
  spawnNbody, 
  spawnCloth,
  spawnText,
  spawnGenerator 
} from "./emitters.ts";
import { ParticleSoA } from "./soa.ts";
import { SpawnOpts } from "./emitters.ts";

function createMockSoA(capacity: number): ParticleSoA {
  return {
    capacity,
    pos: new Float32Array(capacity * 2),
    vel: new Float32Array(capacity * 2),
    prev: new Float32Array(capacity * 2),
    lifeMass: new Float32Array(capacity * 2),
    phaseFlags: new Uint32Array(capacity * 2),
    spawnSlot: function() { 
      // Simple mock counter
      if (!this._count) this._count = 0;
      if (this._count >= this.capacity) return -1;
      return this._count++;
    },
    writeParticle: function(i) {
      // Mock noop
    }
  };
}

const defaultOpts: SpawnOpts = {
  worldW: 1.0,
  worldH: 1.0,
  count: 100,
  mass: 1.0,
  lifespan: 1.0,
  spread: 0.1,
  speed: 1.0,
  originX: 0.5,
  originY: 0.5,
  centralMass: 1.0
};

describe("Emitters", () => {
  test("spawnGalaxy creates expected count", () => {
    const soa = createMockSoA(200);
    const res = spawnGalaxy(soa, defaultOpts);
    expect(res.spawned).toBe(100);
  });
  
  test("spawnRing creates expected count", () => {
    const soa = createMockSoA(200);
    const res = spawnRing(soa, defaultOpts);
    expect(res.spawned).toBe(100);
  });
  
  test("spawnBurst creates expected count", () => {
    const soa = createMockSoA(200);
    const res = spawnBurst(soa, defaultOpts);
    expect(res.spawned).toBe(100);
  });
  
  test("spawnPourBurst creates expected count bounded by limit", () => {
    const soa = createMockSoA(1000);
    const res = spawnPourBurst(soa, { ...defaultOpts, count: 500 });
    // spawnPourBurst restricts to 400
    expect(res.spawned).toBe(400);
  });
  
  test("spawnFallBurst creates expected count bounded by limit", () => {
    const soa = createMockSoA(1000);
    const res = spawnFallBurst(soa, { ...defaultOpts, count: 1000 });
    // spawnFallBurst restricts to 800
    expect(res.spawned).toBe(800);
  });
  
  test("spawnFlock creates expected count", () => {
    const soa = createMockSoA(200);
    const res = spawnFlock(soa, defaultOpts);
    expect(res.spawned).toBe(100);
  });
  
  test("spawnNbody creates expected count bounded by limit", () => {
    const soa = createMockSoA(3000);
    const res = spawnNbody(soa, { ...defaultOpts, count: 2500 });
    // spawnNbody restricts to 2400
    expect(res.spawned).toBe(2400);
  });
  
  test("spawnCloth creates interconnected springs", () => {
    const soa = createMockSoA(2000);
    const res = spawnCloth(soa, defaultOpts);
    expect(res.spawned).toBeGreaterThan(0);
    expect(res.springs.length).toBeGreaterThan(0);
  });
  
  test("spawnText creates particles using OffscreenCanvas fallback", () => {
    const soa = createMockSoA(200);
    // Note: In happy-dom environment, OffscreenCanvas isn't real GPU, 
    // but the fallback handles it or returns a result.
    const res = spawnText(soa, defaultOpts);
    expect(res).toBeDefined();
  });
  
  test("spawnGenerator routes correctly", () => {
    const soa = createMockSoA(200);
    const res = spawnGenerator("ring", soa, defaultOpts);
    expect(res.spawned).toBe(100);
  });
});
