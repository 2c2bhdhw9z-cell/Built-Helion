import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidFrameMs,
  updateFrameMsEma,
  fpsFromFrameMs,
  FrameExtents,
} from "./frame-clock.ts";

describe("isValidFrameMs", () => {
  it("accepts normal frame times", () => {
    assert.equal(isValidFrameMs(16.7), true);
    assert.equal(isValidFrameMs(0.5), true);
  });
  it("rejects zero, negatives, NaN, and absurdly long frames", () => {
    assert.equal(isValidFrameMs(0), false);
    assert.equal(isValidFrameMs(-5), false);
    assert.equal(isValidFrameMs(Number.NaN), false);
    assert.equal(isValidFrameMs(Infinity), false);
    assert.equal(isValidFrameMs(1000), false); // tab-backgrounded gap
  });
});

describe("updateFrameMsEma", () => {
  it("seeds directly from the first valid sample when prev <= 0", () => {
    assert.equal(updateFrameMsEma(0, 16.7), 16.7);
  });
  it("moves toward the new sample but does not jump to it", () => {
    const next = updateFrameMsEma(16.7, 33, 0.1);
    assert.ok(next > 16.7 && next < 33, `ema ${next} should be between`);
    assert.ok(Math.abs(next - (16.7 * 0.9 + 33 * 0.1)) < 1e-9);
  });
  it("ignores invalid samples, leaving the average unchanged", () => {
    assert.equal(updateFrameMsEma(16.7, 0), 16.7);
    assert.equal(updateFrameMsEma(16.7, Number.NaN), 16.7);
    assert.equal(updateFrameMsEma(16.7, 5000), 16.7);
  });
  it("a single outlier frame barely moves the smoothed value (the fix)", () => {
    // Steady 16ms then one 100ms hitch: EMA stays near 16, so the headline FPS
    // does not spike — the whole point of the change.
    let ema = 16;
    ema = updateFrameMsEma(ema, 100, 0.1); // one bad frame
    assert.ok(ema < 25, `one hitch moved ema to ${ema}, expected < 25ms`);
    assert.ok(fpsFromFrameMs(ema) > 40, "smoothed fps should not crater on one frame");
  });
});

describe("fpsFromFrameMs", () => {
  it("16.7ms -> ~60fps, 8.33ms -> ~120fps", () => {
    assert.ok(Math.abs(fpsFromFrameMs(16.6667) - 60) < 0.1);
    assert.ok(Math.abs(fpsFromFrameMs(8.3333) - 120) < 0.1);
  });
  it("is consistent with ms so 16ms never reads as 100fps", () => {
    assert.ok(fpsFromFrameMs(16) < 63, "16ms must be ~62.5fps, never 100");
  });
  it("returns 0 for non-positive input", () => {
    assert.equal(fpsFromFrameMs(0), 0);
    assert.equal(fpsFromFrameMs(-1), 0);
  });
});

describe("FrameExtents", () => {
  it("returns fallback when nothing observed", () => {
    const fe = new FrameExtents();
    assert.deepEqual(fe.read(16), { min: 16, max: 16 });
  });
  it("tracks true min/max over observed frames", () => {
    const fe = new FrameExtents(10);
    for (const ms of [16, 16, 9, 16, 40, 16]) fe.observe(ms);
    assert.deepEqual(fe.read(0), { min: 9, max: 40 });
  });
  it("skips invalid frames so a backgrounded gap never poisons the extremes", () => {
    const fe = new FrameExtents(10);
    fe.observe(16);
    fe.observe(5000); // ignored
    fe.observe(17);
    assert.deepEqual(fe.read(0), { min: 16, max: 17 });
  });
  it("only reflects the most recent N frames (rolling window)", () => {
    const fe = new FrameExtents(3);
    fe.observe(100); // will be evicted
    fe.observe(16);
    fe.observe(16);
    fe.observe(17); // evicts the 100
    assert.deepEqual(fe.read(0), { min: 16, max: 17 });
  });
});
