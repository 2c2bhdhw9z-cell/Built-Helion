import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compositeTargetSize } from "./composite.ts";

describe("compositeTargetSize", () => {
  it("returns the engine size unchanged when there is no maxDim", () => {
    assert.deepEqual(compositeTargetSize({ width: 1920, height: 1080 }), {
      width: 1920,
      height: 1080,
      scale: 1,
    });
  });

  it("returns the engine size unchanged when under maxDim", () => {
    assert.deepEqual(compositeTargetSize({ width: 1280, height: 720 }, 2048), {
      width: 1280,
      height: 720,
      scale: 1,
    });
  });

  it("scales down preserving aspect ratio when the longest side exceeds maxDim", () => {
    const result = compositeTargetSize({ width: 4000, height: 2000 }, 2000);
    assert.equal(result.width, 2000);
    assert.equal(result.height, 1000);
    assert.equal(result.scale, 0.5);
    assert.ok(result.scale < 1);
  });

  it("clamps on the longest side when height is the longest", () => {
    const result = compositeTargetSize({ width: 1000, height: 4000 }, 2000);
    assert.equal(result.height, 2000);
    assert.equal(result.width, 500);
    assert.equal(result.scale, 0.5);
  });

  it("never returns a zero dimension", () => {
    const result = compositeTargetSize({ width: 10, height: 4000 }, 100);
    assert.ok(result.width >= 1);
    assert.ok(result.height >= 1);
  });
});
