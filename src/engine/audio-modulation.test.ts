import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PARAMS } from "./types.ts";
import {
  applyAudioModulation,
  signalValue,
  normalizeMappings,
  DEFAULT_AUDIO_MAPPINGS,
  type AudioSignal,
  type AudioMapping,
} from "./audio-modulation.ts";

const silent: AudioSignal = { bass: 0, mid: 0, level: 0 };
const loud: AudioSignal = { bass: 1, mid: 0.5, level: 0.8 };

describe("audio-modulation: signalValue", () => {
  it("reads each band and clamps to 0..1", () => {
    assert.equal(signalValue({ bass: 0.4, mid: 0.2, level: 0.9 }, "bass"), 0.4);
    assert.equal(signalValue({ bass: 0.4, mid: 0.2, level: 0.9 }, "mid"), 0.2);
    assert.equal(signalValue({ bass: 0.4, mid: 0.2, level: 0.9 }, "level"), 0.9);
    assert.equal(signalValue({ bass: 5, mid: -1, level: NaN }, "bass"), 1);
    assert.equal(signalValue({ bass: 5, mid: -1, level: NaN }, "mid"), 0);
    assert.equal(signalValue({ bass: 5, mid: -1, level: NaN }, "level"), 0);
  });
});

describe("audio-modulation: applyAudioModulation", () => {
  it("does not mutate the base params", () => {
    const base = { ...DEFAULT_PARAMS };
    const before = base.pointSize;
    applyAudioModulation(base, loud, [{ source: "bass", target: "size", amount: 1 }]);
    assert.equal(base.pointSize, before);
  });

  it("is a no-op with no mappings", () => {
    const { params, outputs } = applyAudioModulation(DEFAULT_PARAMS, loud, []);
    assert.equal(params.pointSize, DEFAULT_PARAMS.pointSize);
    assert.equal(outputs.spawnBurst, 0);
    assert.equal(outputs.palettePulse, 0);
  });

  it("is a no-op when the signal is silent", () => {
    const { params, outputs } = applyAudioModulation(DEFAULT_PARAMS, silent, DEFAULT_AUDIO_MAPPINGS);
    assert.equal(params.pointSize, DEFAULT_PARAMS.pointSize);
    assert.equal(params.forceStrength, DEFAULT_PARAMS.forceStrength);
    assert.equal(outputs.spawnBurst, 0);
  });

  it("grows point size with the bass->size mapping", () => {
    const { params } = applyAudioModulation(DEFAULT_PARAMS, loud, [
      { source: "bass", target: "size", amount: 1 },
    ]);
    assert.ok(params.pointSize > DEFAULT_PARAMS.pointSize);
  });

  it("respects amount=0 (off)", () => {
    const { params } = applyAudioModulation(DEFAULT_PARAMS, loud, [
      { source: "bass", target: "size", amount: 0 },
    ]);
    assert.equal(params.pointSize, DEFAULT_PARAMS.pointSize);
  });

  it("scales by sensitivity", () => {
    const low = applyAudioModulation(DEFAULT_PARAMS, loud, [{ source: "bass", target: "size", amount: 1 }], 0.5);
    const high = applyAudioModulation(DEFAULT_PARAMS, loud, [{ source: "bass", target: "size", amount: 1 }], 2);
    assert.ok(high.params.pointSize > low.params.pointSize);
  });

  it("routes spawn and palette to outputs (0..1)", () => {
    const { outputs } = applyAudioModulation(DEFAULT_PARAMS, loud, [
      { source: "bass", target: "spawn", amount: 1 },
      { source: "level", target: "palette", amount: 1 },
    ]);
    assert.ok(outputs.spawnBurst > 0 && outputs.spawnBurst <= 1);
    assert.ok(outputs.palettePulse > 0 && outputs.palettePulse <= 1);
  });

  it("adds to force and gravity within clamps", () => {
    const { params } = applyAudioModulation(DEFAULT_PARAMS, loud, [
      { source: "level", target: "force", amount: 2 },
      { source: "bass", target: "gravity", amount: 2 },
    ]);
    assert.ok(params.forceStrength > DEFAULT_PARAMS.forceStrength);
    assert.ok(params.forceStrength <= 20);
    assert.ok(params.gravityY > DEFAULT_PARAMS.gravityY);
    assert.ok(params.gravityY <= 20);
  });
});

describe("audio-modulation: normalizeMappings", () => {
  it("drops unknown sources/targets and clamps amount", () => {
    const out = normalizeMappings([
      { source: "bass", target: "size", amount: 5 },
      { source: "nope", target: "size", amount: 1 },
      { source: "mid", target: "bogus", amount: 1 },
      { source: "level", target: "force", amount: -3 },
      "garbage",
      null,
    ]);
    assert.deepEqual(out, [
      { source: "bass", target: "size", amount: 2 },
      { source: "level", target: "force", amount: 0 },
    ]);
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(normalizeMappings(null), []);
    assert.deepEqual(normalizeMappings({}), []);
    assert.deepEqual(normalizeMappings(undefined), []);
  });
});
