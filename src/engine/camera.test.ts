import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampViewZoom, fillWorldScale, viewCssPanEnabled, viewCssScale } from "./camera.ts";

describe("fill-frame camera", () => {
  it("clamps zoom to the slider range", () => {
    assert.equal(clampViewZoom(0.1), 0.4);
    assert.equal(clampViewZoom(99), 8);
    assert.equal(clampViewZoom(1), 1);
  });

  it("letterbox keeps world scale at 1 and CSS-scales the picture", () => {
    assert.equal(fillWorldScale(false, 0.4), 1);
    assert.equal(viewCssScale(false, 0.4), 0.4);
    assert.equal(viewCssScale(false, 2), 2);
  });

  it("fill-frame zoom-out grows the world and keeps the canvas full-bleed", () => {
    assert.equal(fillWorldScale(true, 0.4), 2.5);
    assert.equal(viewCssScale(true, 0.4), 1);
    assert.equal(viewCssPanEnabled(true, 0.4), false);
  });

  it("fill-frame zoom-in stays a CSS magnify", () => {
    assert.equal(fillWorldScale(true, 2), 1);
    assert.equal(viewCssScale(true, 2), 2);
    assert.equal(viewCssPanEnabled(true, 2), true);
  });

  it("fill-frame at 1.00× is a no-op", () => {
    assert.equal(fillWorldScale(true, 1), 1);
    assert.equal(viewCssScale(true, 1), 1);
  });
});
