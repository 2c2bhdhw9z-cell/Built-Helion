import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampViewPitch,
  clampViewZoom,
  fillWorldScale,
  projectOrbit,
  trailFadeAlpha,
  unprojectOrbit,
  viewCssPanEnabled,
  viewCssScale,
} from "./camera.ts";

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

describe("orbit camera", () => {
  it("clamps pitch to 0..72", () => {
    assert.equal(clampViewPitch(-10), 0);
    assert.equal(clampViewPitch(90), 72);
    assert.equal(clampViewPitch(24), 24);
  });

  it("identity yaw/pitch is the 2d ndc map", () => {
    const p = projectOrbit(0.8, 0.25, 1.6, 1, 0, 0);
    assert.ok(Math.abs(p.nx - 0) < 1e-9);
    assert.ok(Math.abs(p.ny - 0.5) < 1e-9);
    assert.equal(p.scale, 1);
  });

  it("unproject inverts project at identity", () => {
    const p = projectOrbit(0.4, 0.7, 1.6, 1, 0, 0);
    const w = unprojectOrbit(p.nx, p.ny, 1.6, 1, 0, 0);
    assert.ok(Math.abs(w.x - 0.4) < 1e-9);
    assert.ok(Math.abs(w.y - 0.7) < 1e-9);
  });

  it("unproject inverts project at a tilted orbit", () => {
    const yaw = 0.4;
    const pitch = 0.35;
    const p = projectOrbit(0.9, 0.3, 1.6, 1, yaw, pitch);
    const w = unprojectOrbit(p.nx, p.ny, 1.6, 1, yaw, pitch);
    assert.ok(Math.abs(w.x - 0.9) < 1e-5, `x ${w.x}`);
    assert.ok(Math.abs(w.y - 0.3) < 1e-5, `y ${w.y}`);
  });

  it("longer trails fade slower", () => {
    const short = trailFadeAlpha(0.22, 0.2);
    const long = trailFadeAlpha(0.22, 1.4);
    assert.ok(long < short);
  });
});
