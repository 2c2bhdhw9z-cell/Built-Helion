import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { particleBufferSizes } from "./webgpu-buffers.ts";

// These assert the byte-size math the WebGPU backend uses to (re)allocate its
// three per-particle storage buffers. This is the math that must match the SoA
// capacity after a cap change; getting it wrong is what caused particles past
// the original cap to be dropped by the GPU. It is pure and GPU-free, so it is
// unit-testable in node (the actual buffer allocation / render is not).

describe("particleBufferSizes", () => {
  it("uses the correct per-particle strides (posPrev=16, vel=8, lmp=16)", () => {
    const s = particleBufferSizes(1);
    assert.equal(s.posPrev, 16);
    assert.equal(s.vel, 8);
    assert.equal(s.lifeMassPhase, 16);
  });

  it("scales linearly with capacity", () => {
    const s = particleBufferSizes(10_000);
    assert.equal(s.posPrev, 10_000 * 16);
    assert.equal(s.vel, 10_000 * 8);
    assert.equal(s.lifeMassPhase, 10_000 * 16);
  });

  it("grows monotonically when the cap is raised", () => {
    const small = particleBufferSizes(1024);
    const big = particleBufferSizes(65_536);
    assert.ok(big.posPrev > small.posPrev);
    assert.ok(big.vel > small.vel);
    assert.ok(big.lifeMassPhase > small.lifeMassPhase);
  });

  it("clamps degenerate caps to at least one particle", () => {
    for (const bad of [0, -5, Number.NaN]) {
      const s = particleBufferSizes(bad);
      assert.equal(s.posPrev, 16);
      assert.equal(s.vel, 8);
      assert.equal(s.lifeMassPhase, 16);
    }
  });

  it("truncates fractional caps (matches | 0 int coercion)", () => {
    const s = particleBufferSizes(1024.9);
    assert.equal(s.posPrev, 1024 * 16);
  });
});
