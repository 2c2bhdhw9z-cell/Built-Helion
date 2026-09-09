import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGesture,
  isLongPress,
  LONG_PRESS_MOVE_TOLERANCE,
  LONG_PRESS_MS,
  pinchScale,
  pointerDistance,
  pointerMidpoint,
} from "./touch.ts";

describe("classifyGesture", () => {
  it("0 pointers is none", () => assert.equal(classifyGesture(0), "none"));
  it("1 pointer paints (single-finger brush stays intact)", () =>
    assert.equal(classifyGesture(1), "paint"));
  it("2 pointers is pan-zoom", () => assert.equal(classifyGesture(2), "pan-zoom"));
  it("3+ pointers is still pan-zoom", () => assert.equal(classifyGesture(5), "pan-zoom"));
  it("negative count is none", () => assert.equal(classifyGesture(-1), "none"));
});

describe("pointer geometry", () => {
  it("distance is euclidean and floored at 1", () => {
    assert.equal(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.equal(pointerDistance({ x: 2, y: 2 }, { x: 2, y: 2 }), 1);
  });
  it("midpoint is the average", () => {
    assert.deepEqual(pointerMidpoint({ x: 0, y: 0 }, { x: 4, y: 8 }), { x: 2, y: 4 });
  });
  it("pinch scale is current/start", () => {
    assert.equal(pinchScale(100, 200), 2);
    assert.equal(pinchScale(200, 100), 0.5);
  });
  it("pinch scale guards against a zero start distance", () => {
    assert.equal(pinchScale(0, 50), 50);
  });
});

describe("isLongPress", () => {
  it("fires for a single pointer held past the threshold with little movement", () => {
    assert.equal(
      isLongPress({ pointerCount: 1, elapsedMs: LONG_PRESS_MS, movedPx: 2 }),
      true,
    );
  });

  it("does not fire before the threshold", () => {
    assert.equal(
      isLongPress({ pointerCount: 1, elapsedMs: LONG_PRESS_MS - 1, movedPx: 0 }),
      false,
    );
  });

  it("does not fire if the finger dragged too far (it's a paint stroke)", () => {
    assert.equal(
      isLongPress({
        pointerCount: 1,
        elapsedMs: LONG_PRESS_MS + 100,
        movedPx: LONG_PRESS_MOVE_TOLERANCE + 1,
      }),
      false,
    );
  });

  it("does not fire with two fingers (that's pan-zoom)", () => {
    assert.equal(
      isLongPress({ pointerCount: 2, elapsedMs: LONG_PRESS_MS + 500, movedPx: 0 }),
      false,
    );
  });

  it("honors custom hold + tolerance", () => {
    assert.equal(
      isLongPress({ pointerCount: 1, elapsedMs: 200, movedPx: 5, holdMs: 150, moveTolerance: 6 }),
      true,
    );
    assert.equal(
      isLongPress({ pointerCount: 1, elapsedMs: 200, movedPx: 5, holdMs: 250, moveTolerance: 6 }),
      false,
    );
  });
});
