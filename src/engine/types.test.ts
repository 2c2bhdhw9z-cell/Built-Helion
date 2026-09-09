import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_CAP_CEILING,
  PRO_GENERATORS,
  QUALITY_CAPS,
  SYSTEM_LIMIT,
  capCeiling,
  clampCap,
  isProGenerator,
  qualityCap,
  shapeId,
} from "./types.ts";

describe("qualityCap", () => {
  it("follows the quality preset and ignores plan", () => {
    assert.equal(qualityCap("low"), QUALITY_CAPS.low);
    assert.equal(qualityCap("medium"), QUALITY_CAPS.medium);
    assert.equal(qualityCap("high"), QUALITY_CAPS.high);
    assert.equal(QUALITY_CAPS.high, 65_536);
  });
});

describe("capCeiling / clampCap (Item 23 — Pro particle cap)", () => {
  it("free is capped at the free ceiling; entitled unlocks SYSTEM_LIMIT", () => {
    assert.equal(capCeiling(false), FREE_CAP_CEILING);
    assert.equal(capCeiling(true), SYSTEM_LIMIT);
    assert.ok(FREE_CAP_CEILING < SYSTEM_LIMIT);
  });

  it("every quality preset stays at or below the free ceiling", () => {
    for (const q of ["low", "medium", "high"] as const) {
      assert.ok(QUALITY_CAPS[q] <= FREE_CAP_CEILING);
    }
  });

  it("clampCap clamps a free request above the ceiling down to it", () => {
    assert.equal(clampCap(500_000, false), FREE_CAP_CEILING);
    assert.equal(clampCap(50_000, false), 50_000);
    assert.equal(clampCap(500_000, true), 500_000);
    assert.equal(clampCap(2_000_000, true), SYSTEM_LIMIT);
  });

  it("clampCap enforces the 1024 floor for both plans", () => {
    assert.equal(clampCap(10, false), 1024);
    assert.equal(clampCap(10, true), 1024);
  });
});

describe("isProGenerator (Item 23 — exclusive generators)", () => {
  it("marks exactly the curated Pro set", () => {
    assert.equal(PRO_GENERATORS.length, 6);
    for (const g of PRO_GENERATORS) assert.equal(isProGenerator(g), true);
    assert.equal(isProGenerator("galaxy"), false);
    assert.equal(isProGenerator("ring"), false);
  });
});

describe("shapeId", () => {
  it("gives GPU atlas ids for emoji and sprite", () => {
    assert.equal(shapeId("circle"), 0);
    assert.equal(shapeId("star"), 5);
    assert.equal(shapeId("emoji"), 10);
    assert.equal(shapeId("sprite"), 11);
  });
});
