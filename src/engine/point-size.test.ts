import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backingPointSize, shapeSizeFactor } from "./point-size.ts";

// These assert the shared point-size math both the WebGL and WebGPU backends
// route through so on-screen particle size is identical across backends at any
// device pixel ratio. The historical WebGPU bug was omitting the dpr factor
// that WebGL applied inline, making particles smaller on WebGPU except at
// dpr === 2. The actual GPU render is not headlessly testable; this math is.

describe("shapeSizeFactor", () => {
  it("bumps emoji and sprite glyphs by 1.7", () => {
    assert.equal(shapeSizeFactor("emoji"), 1.7);
    assert.equal(shapeSizeFactor("sprite"), 1.7);
  });

  it("leaves solid shapes at 1x", () => {
    for (const shape of ["circle", "square", "ring", "star", "heart"] as const) {
      assert.equal(shapeSizeFactor(shape), 1);
    }
  });
});

describe("backingPointSize", () => {
  it("multiplies point size by the device pixel ratio (backend parity)", () => {
    // This is exactly the pre-clamp value WebGL feeds gl_PointSize and the
    // value the WebGPU shader treats as backing pixels — they must agree.
    assert.equal(backingPointSize(10, 1, "circle"), 10);
    assert.equal(backingPointSize(10, 2, "circle"), 20);
    assert.equal(backingPointSize(10, 1.5, "circle"), 15);
    assert.equal(backingPointSize(10, 3, "circle"), 30);
  });

  it("applies the emoji/sprite factor on top of dpr", () => {
    assert.equal(backingPointSize(10, 2, "emoji"), 34);
    assert.equal(backingPointSize(10, 2, "sprite"), 34);
  });

  it("differs from the dpr-less value at any dpr other than 1", () => {
    const dprLess = 10 * shapeSizeFactor("circle");
    assert.notEqual(backingPointSize(10, 2, "circle"), dprLess);
    assert.equal(backingPointSize(10, 1, "circle"), dprLess);
  });

  it("falls back to dpr=1 for non-finite or non-positive dpr", () => {
    assert.equal(backingPointSize(10, Number.NaN, "circle"), 10);
    assert.equal(backingPointSize(10, 0, "circle"), 10);
    assert.equal(backingPointSize(10, -2, "circle"), 10);
  });

  it("treats a non-finite point size as zero", () => {
    assert.equal(backingPointSize(Number.NaN, 2, "circle"), 0);
  });
});
