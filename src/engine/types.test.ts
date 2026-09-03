import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QUALITY_CAPS, qualityCap, SYSTEM_LIMIT } from "./types.ts";

describe("qualityCap", () => {
  it("returns the base cap when quality is not high", () => {
    assert.equal(qualityCap("low", true, "enterprise"), QUALITY_CAPS.low);
    assert.equal(qualityCap("medium", true, "pro"), QUALITY_CAPS.medium);
  });

  it("returns the base high cap when not entitled", () => {
    assert.equal(qualityCap("high", false, "free"), QUALITY_CAPS.high);
  });

  it("raises High to 262k on Pro", () => {
    assert.equal(qualityCap("high", true, "pro"), 262_144);
  });

  it("raises High to 1M on Enterprise", () => {
    assert.equal(qualityCap("high", true, "enterprise"), SYSTEM_LIMIT);
  });
});
