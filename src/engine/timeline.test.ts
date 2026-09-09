import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createTrack,
  createTimelineState,
  addKeyframe,
  removeKeyframe,
  sortTrack,
  trackDuration,
  sampleTimeline,
  advanceTimeline,
  scrubTimeline,
  normalizeTrack,
  type Track,
} from "./timeline.ts";

const track3 = (): Track => ({
  loop: true,
  keys: [
    { t: 0, params: { gravityY: 0, palette: "rainbow" } },
    { t: 1, params: { gravityY: 10, palette: "ember" } },
    { t: 2, params: { gravityY: 0, palette: "ice" } },
  ],
});

describe("timeline: sampleTimeline", () => {
  it("empty track returns no overrides", () => {
    assert.deepEqual(sampleTimeline(createTrack(), 5), {});
  });

  it("single keyframe returns its params everywhere", () => {
    const t: Track = { loop: false, keys: [{ t: 3, params: { gravityY: 7, shape: "star" } }] };
    assert.deepEqual(sampleTimeline(t, 0), { gravityY: 7, shape: "star" });
    assert.deepEqual(sampleTimeline(t, 99), { gravityY: 7, shape: "star" });
  });

  it("holds the first keyframe before the start", () => {
    const s = sampleTimeline(track3(), -5);
    assert.equal(s.gravityY, 0);
    assert.equal(s.palette, "rainbow");
  });

  it("holds the last keyframe after the end", () => {
    const s = sampleTimeline(track3(), 100);
    assert.equal(s.gravityY, 0);
    assert.equal(s.palette, "ice");
  });

  it("returns the exact value on a keyframe", () => {
    const s = sampleTimeline(track3(), 1);
    assert.equal(s.gravityY, 10);
    assert.equal(s.palette, "ember");
  });

  it("linearly interpolates a numeric field between keyframes", () => {
    const s = sampleTimeline(track3(), 0.5);
    assert.ok(Math.abs(s.gravityY! - 5) < 1e-6, `got ${s.gravityY}`);
    // palette step-holds the earlier keyframe across the interval
    assert.equal(s.palette, "rainbow");
  });

  it("interpolates on the descending segment too", () => {
    const s = sampleTimeline(track3(), 1.5);
    assert.ok(Math.abs(s.gravityY! - 5) < 1e-6, `got ${s.gravityY}`);
    assert.equal(s.palette, "ember");
  });

  it("holds the side that has a numeric key when the other lacks it", () => {
    const t: Track = {
      loop: false,
      keys: [
        { t: 0, params: { gravityY: 2 } },
        { t: 1, params: { pointSize: 8 } },
      ],
    };
    const mid = sampleTimeline(t, 0.5);
    assert.equal(mid.gravityY, 2, "gravityY holds from the left keyframe");
    assert.equal(mid.pointSize, 8, "pointSize holds from the right keyframe");
  });
});

describe("timeline: addKeyframe / removeKeyframe / sort", () => {
  it("keeps keys sorted and replaces a same-time keyframe", () => {
    let t = createTrack();
    t = addKeyframe(t, 2, { gravityY: 5 });
    t = addKeyframe(t, 1, { gravityY: 1 });
    t = addKeyframe(t, 2, { gravityY: 9 }); // replace @2
    assert.deepEqual(t.keys.map((k) => k.t), [1, 2]);
    assert.equal(t.keys[1]!.params.gravityY, 9);
  });

  it("clamps negative times to 0", () => {
    const t = addKeyframe(createTrack(), -3, { gravityY: 1 });
    assert.equal(t.keys[0]!.t, 0);
  });

  it("removeKeyframe drops by index and is a no-op out of range", () => {
    let t = track3();
    t = removeKeyframe(t, 1);
    assert.deepEqual(t.keys.map((k) => k.t), [0, 2]);
    assert.equal(removeKeyframe(t, 99).keys.length, 2);
  });

  it("sortTrack orders by time", () => {
    const t: Track = { loop: true, keys: [{ t: 2, params: {} }, { t: 0, params: {} }] };
    assert.deepEqual(sortTrack(t).keys.map((k) => k.t), [0, 2]);
  });

  it("trackDuration is the last key time (0 when empty)", () => {
    assert.equal(trackDuration(createTrack()), 0);
    assert.equal(trackDuration(track3()), 2);
  });
});

describe("timeline: advanceTimeline (controller state machine)", () => {
  it("does nothing when paused", () => {
    const s = { playing: false, playhead: 0.5 };
    assert.deepEqual(advanceTimeline(s, track3(), 1), s);
  });

  it("advances the playhead by dt while playing", () => {
    const s = advanceTimeline({ playing: true, playhead: 0 }, track3(), 0.5);
    assert.ok(Math.abs(s.playhead - 0.5) < 1e-6);
    assert.equal(s.playing, true);
  });

  it("wraps to the start when looping past the end", () => {
    const s = advanceTimeline({ playing: true, playhead: 1.8 }, track3(), 0.5);
    assert.ok(s.playhead >= 0 && s.playhead < 2, `wrapped to ${s.playhead}`);
    assert.ok(Math.abs(s.playhead - 0.3) < 1e-6);
    assert.equal(s.playing, true);
  });

  it("clamps and stops at the end when not looping", () => {
    const t = { ...track3(), loop: false };
    const s = advanceTimeline({ playing: true, playhead: 1.9 }, t, 0.5);
    assert.equal(s.playhead, 2);
    assert.equal(s.playing, false);
  });

  it("holds at 0 for a zero-duration track", () => {
    const single: Track = { loop: false, keys: [{ t: 0, params: { gravityY: 1 } }] };
    const s = advanceTimeline({ playing: true, playhead: 0 }, single, 1);
    assert.equal(s.playhead, 0);
    assert.equal(s.playing, false);
  });
});

describe("timeline: scrubTimeline", () => {
  it("clamps the playhead into [0, duration]", () => {
    const t = track3();
    assert.equal(scrubTimeline(createTimelineState(), t, -1).playhead, 0);
    assert.equal(scrubTimeline(createTimelineState(), t, 5).playhead, 2);
    assert.equal(scrubTimeline(createTimelineState(), t, 1.25).playhead, 1.25);
  });
});

describe("timeline: normalizeTrack", () => {
  it("returns null for garbage / empty", () => {
    assert.equal(normalizeTrack(null), null);
    assert.equal(normalizeTrack(42), null);
    assert.equal(normalizeTrack({}), null);
    assert.equal(normalizeTrack({ keys: [] }), null);
    assert.equal(normalizeTrack({ keys: [{ t: "x", params: {} }] }), null);
  });

  it("keeps only valid animatable keys and sorts by time", () => {
    const t = normalizeTrack({
      loop: false,
      keys: [
        { t: 2, params: { gravityY: 3, bogus: 1, palette: "ice" } },
        { t: 0, params: { gravityY: Number.NaN, pointSize: 5 } },
        { t: 1, params: {} }, // dropped: no valid keys
      ],
    });
    assert.ok(t);
    assert.equal(t!.loop, false);
    assert.deepEqual(t!.keys.map((k) => k.t), [0, 2]);
    assert.deepEqual(t!.keys[0]!.params, { pointSize: 5 });
    assert.deepEqual(t!.keys[1]!.params, { gravityY: 3, palette: "ice" });
  });

  it("defaults loop to true when not explicitly false", () => {
    const t = normalizeTrack({ keys: [{ t: 0, params: { gravityY: 1 } }] });
    assert.equal(t!.loop, true);
  });
});
