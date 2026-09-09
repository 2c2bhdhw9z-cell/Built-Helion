import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParticleSoA } from "./soa.ts";
import { SYSTEM_LIMIT } from "./types.ts";

describe("ParticleSoA.allocate growth invariants", () => {
  it("allocates at least the requested capacity", () => {
    const soa = new ParticleSoA(1024);
    assert.ok(soa.capacity >= 1024);
    soa.allocate(4096);
    assert.ok(soa.capacity >= 4096, `capacity ${soa.capacity} < 4096`);
  });

  it("keeps every backing typed-array length equal to capacity after growth", () => {
    const soa = new ParticleSoA(1024);
    soa.allocate(50_000);
    const n = soa.capacity;
    assert.equal(soa.posX.length, n);
    assert.equal(soa.posY.length, n);
    assert.equal(soa.velX.length, n);
    assert.equal(soa.velY.length, n);
    assert.equal(soa.prevX.length, n);
    assert.equal(soa.prevY.length, n);
    assert.equal(soa.life.length, n);
    assert.equal(soa.maxLife.length, n);
    assert.equal(soa.mass.length, n);
    assert.equal(soa.phase.length, n);
    assert.equal(soa.flags.length, n);
  });

  it("preserves the live particle count and data when the cap is increased", () => {
    const soa = new ParticleSoA(2048);
    // fill a handful of live particles with recognizable values
    for (let i = 0; i < 100; i++) {
      const slot = soa.spawnSlot();
      soa.writeParticle(slot, i, i * 2, 0.5, -0.5, 1, 1);
    }
    assert.equal(soa.count, 100);

    const before = soa.capacity;
    soa.allocate(200_000);

    // capacity grew to at least the request, count is preserved, data is intact
    assert.ok(soa.capacity >= 200_000, `capacity ${soa.capacity} < 200000`);
    assert.ok(soa.capacity > before);
    assert.equal(soa.count, 100);
    assert.equal(soa.posX[0], 0);
    assert.equal(soa.posX[99], 99);
    assert.equal(soa.posY[99], 198);
    assert.equal(soa.velX[50], 0.5);
  });

  it("does not exceed SYSTEM_LIMIT even when asked for more", () => {
    const soa = new ParticleSoA(1024);
    soa.allocate(SYSTEM_LIMIT * 4);
    assert.ok(soa.capacity <= SYSTEM_LIMIT, `capacity ${soa.capacity} > SYSTEM_LIMIT`);
  });

  it("does not shrink for a request within the keep-threshold (>= half current)", () => {
    const soa = new ParticleSoA(1024);
    soa.allocate(100_000);
    const cap = soa.capacity;
    // requesting slightly less than current but >= half keeps the existing buffers
    soa.allocate(Math.floor(cap * 0.75));
    assert.equal(soa.capacity, cap);
  });
});
