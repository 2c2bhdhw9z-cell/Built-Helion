import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyUsage, formatDuration } from "./analytics.ts";

describe("usage analytics", () => {
  it("starts empty", () => {
    const u = emptyUsage();
    assert.equal(u.spawns, 0);
    assert.equal(u.peak, 0);
  });

  it("formats duration", () => {
    assert.equal(formatDuration(12), "12s");
    assert.equal(formatDuration(90), "1m");
    assert.equal(formatDuration(3661), "1h 1m");
  });
});
