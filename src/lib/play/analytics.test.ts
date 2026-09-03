import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { addSeconds, emptyUsage, formatDuration, hasDelta, readUsage, takeDelta } from "./analytics.ts";
import { newMemoryKv, setKvStore } from "../platform/storage.ts";

describe("usage analytics", () => {
  beforeEach(() => {
    setKvStore(newMemoryKv());
  });

  it("starts empty", () => {
    const u = emptyUsage();
    assert.equal(u.spawns, 0);
    assert.equal(u.peak, 0);
    assert.equal(readUsage().seconds, 0);
  });

  it("formats duration", () => {
    assert.equal(formatDuration(12), "12s");
    assert.equal(formatDuration(90), "1m");
    assert.equal(formatDuration(3661), "1h 1m");
  });

  it("takeDelta does not invent past time on first flush", () => {
    addSeconds(30);
    const first = takeDelta();
    assert.equal(hasDelta(first), false);
    addSeconds(15);
    const second = takeDelta();
    assert.equal(second.seconds, 15);
  });
});
