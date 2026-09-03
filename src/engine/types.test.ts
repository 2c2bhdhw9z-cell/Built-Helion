import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QUALITY_CAPS, qualityCap } from "./types.ts";

describe("qualityCap", () => {
  it("follows the quality preset and ignores plan", () => {
    assert.equal(qualityCap("low"), QUALITY_CAPS.low);
    assert.equal(qualityCap("medium"), QUALITY_CAPS.medium);
    assert.equal(qualityCap("high"), QUALITY_CAPS.high);
    assert.equal(QUALITY_CAPS.high, 65_536);
  });
});
