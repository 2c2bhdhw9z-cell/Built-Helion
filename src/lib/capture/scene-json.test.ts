import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sceneDocument, sceneJson } from "./scene-json.ts";

const config = {
  spawnKind: "galaxy",
  spawnCount: 1000,
  speed: 1,
  cap: 65536,
};

describe("sceneJson", () => {
  it("wraps config in a Helion scene document", () => {
    const doc = sceneDocument(config, "Nova");
    assert.equal(doc.helion, 1);
    assert.equal(doc.name, "Nova");
    assert.equal((doc.config as { spawnKind: string }).spawnKind, "galaxy");
  });

  it("pretty-prints JSON with a trailing newline", () => {
    const raw = sceneJson(config, "Nova");
    assert.ok(raw.endsWith("\n"));
    const parsed = JSON.parse(raw) as { helion: number; name: string };
    assert.equal(parsed.helion, 1);
    assert.equal(parsed.name, "Nova");
  });
});
