import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SCENES, type Scene, type SceneId } from "./scenes.ts";
import { DEFAULT_PARAMS, type GeneratorKind } from "./types.ts";

const REQUIRED_IDS: SceneId[] = [
  "black-hole",
  "galaxy-collision",
  "fireworks",
  "murmuration",
  "whirlpool",
  "flow-field",
  "waterfall",
  "cloth",
  "nebula",
];

const VALID_KINDS: GeneratorKind[] = [
  "galaxy",
  "ring",
  "burst",
  "pour",
  "fall",
  "flock",
  "cloth",
  "nbody",
  "text",
];

// Mirrors the store's setSpawnCount / applyScene clamp bounds.
const CLAMP_MIN = 50;
const CLAMP_MAX = 200_000;

const byId = (id: SceneId): Scene => {
  const scene = SCENES.find((s) => s.id === id);
  assert.ok(scene, `scene ${id} must exist`);
  return scene as Scene;
};

describe("SCENES catalog", () => {
  it("has between 8 and 10 curated scenes", () => {
    assert.ok(SCENES.length >= 8 && SCENES.length <= 10, `got ${SCENES.length}`);
  });

  it("includes every required scene id", () => {
    const ids = new Set(SCENES.map((s) => s.id));
    for (const id of REQUIRED_IDS) {
      assert.ok(ids.has(id), `missing required scene: ${id}`);
    }
  });

  it("has unique scene ids", () => {
    const ids = SCENES.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, "scene ids must be unique");
  });

  it("uses only valid GeneratorKind bases (no invented generators)", () => {
    for (const s of SCENES) {
      assert.ok(VALID_KINDS.includes(s.kind), `scene ${s.id} has invalid kind ${s.kind}`);
    }
  });

  it("gives every scene a non-empty label", () => {
    for (const s of SCENES) {
      assert.equal(typeof s.label, "string");
      assert.ok(s.label.length > 0, `scene ${s.id} needs a label`);
    }
  });
});

describe("scene params merge exactly onto the DEFAULT_PARAMS key set", () => {
  const defaultKeys = Object.keys(DEFAULT_PARAMS).sort();

  it("every effective params object has the exact DEFAULT_PARAMS key set", () => {
    for (const s of SCENES) {
      // A misspelled param name would introduce an extra key here and fail.
      const effective = { ...DEFAULT_PARAMS, ...s.params };
      const effectiveKeys = Object.keys(effective).sort();
      assert.deepEqual(
        effectiveKeys,
        defaultKeys,
        `scene ${s.id} effective params keys differ from DEFAULT_PARAMS`,
      );
    }
  });

  it("every scene.params key is a real DEFAULT_PARAMS key", () => {
    const defaultKeySet = new Set(defaultKeys);
    for (const s of SCENES) {
      for (const key of Object.keys(s.params)) {
        assert.ok(defaultKeySet.has(key), `scene ${s.id} sets unknown param ${key}`);
      }
    }
  });
});

describe("scene spawnCount within the store clamp range", () => {
  it("every spawnCount is finite and inside 50..200000", () => {
    for (const s of SCENES) {
      assert.ok(Number.isFinite(s.spawnCount), `scene ${s.id} spawnCount must be finite`);
      assert.ok(
        s.spawnCount >= CLAMP_MIN && s.spawnCount <= CLAMP_MAX,
        `scene ${s.id} spawnCount ${s.spawnCount} out of range`,
      );
    }
  });

  it("optional speed, when set, is a supported multiplier", () => {
    const allowed = new Set([0.25, 0.5, 1, 2, 4]);
    for (const s of SCENES) {
      if (s.speed !== undefined) {
        assert.ok(allowed.has(s.speed), `scene ${s.id} has unsupported speed ${s.speed}`);
      }
    }
  });
});

describe("DEFAULT_PARAMS baseline resets stale toggles between scenes", () => {
  it("cloth's effective params do NOT retain black-hole's nbody flag", () => {
    const blackHole = byId("black-hole");
    const cloth = byId("cloth");
    // black-hole turns nbody ON.
    assert.equal({ ...DEFAULT_PARAMS, ...blackHole.params }.nbody, true);
    // Applying cloth over the DEFAULT_PARAMS baseline must reset nbody to false,
    // proving scenes cannot inherit a prior scene's distinctive toggle.
    assert.equal({ ...DEFAULT_PARAMS, ...cloth.params }.nbody, false);
  });

  it("black-hole's effective params do NOT retain cloth's settle flag", () => {
    const blackHole = byId("black-hole");
    const cloth = byId("cloth");
    // cloth turns settle ON.
    assert.equal({ ...DEFAULT_PARAMS, ...cloth.params }.settle, true);
    // black-hole over the baseline must reset settle to false.
    assert.equal({ ...DEFAULT_PARAMS, ...blackHole.params }.settle, false);
  });

  it("murmuration enables flock while non-flock scenes reset it", () => {
    const murmuration = byId("murmuration");
    const fireworks = byId("fireworks");
    assert.equal({ ...DEFAULT_PARAMS, ...murmuration.params }.flock, true);
    assert.equal({ ...DEFAULT_PARAMS, ...fireworks.params }.flock, false);
  });
});
