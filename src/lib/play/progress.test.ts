import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultProgress, levelFor } from "./progress.ts";

describe("play progress", () => {
  it("starts at level 1 with a daily challenge", () => {
    const p = defaultProgress();
    assert.equal(levelFor(p.xp), 1);
    assert.ok(p.challenge.length > 3);
    assert.equal(p.challengeDone, false);
  });

  it("levels every 100 XP", () => {
    assert.equal(levelFor(0), 1);
    assert.equal(levelFor(99), 1);
    assert.equal(levelFor(100), 2);
    assert.equal(levelFor(250), 3);
  });
});
