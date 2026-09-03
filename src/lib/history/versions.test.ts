import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { newMemoryKv, setKvStore } from "../platform/storage.ts";

register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type Versions = typeof import("./versions.ts");
type EngineTypes = typeof import("../../engine/types.ts");

let listVersions: Versions["listVersions"];
let pushVersion: Versions["pushVersion"];
let removeVersion: Versions["removeVersion"];
let getVersion: Versions["getVersion"];
let DEFAULT_PARAMS: EngineTypes["DEFAULT_PARAMS"];
let config: {
  params: EngineTypes["DEFAULT_PARAMS"];
  spawnKind: "galaxy";
  spawnCount: number;
  speed: 1;
  cap: number;
};

before(async () => {
  const v = await import("./versions.ts");
  listVersions = v.listVersions;
  pushVersion = v.pushVersion;
  removeVersion = v.removeVersion;
  getVersion = v.getVersion;
  DEFAULT_PARAMS = (await import("../../engine/types.ts")).DEFAULT_PARAMS;
  config = {
    params: { ...DEFAULT_PARAMS },
    spawnKind: "galaxy",
    spawnCount: 1000,
    speed: 1,
    cap: 65536,
  };
});

describe("version history", () => {
  beforeEach(() => {
    setKvStore(newMemoryKv());
  });

  it("starts empty", () => {
    assert.deepEqual(listVersions(), []);
  });

  it("pushVersion prepends and listVersions returns it", () => {
    const a = pushVersion("Galaxy A", config);
    assert.equal(a.name, "Galaxy A");
    const listed = listVersions();
    assert.equal(listed[0]?.id, a.id);
    assert.equal(getVersion(a.id)?.name, "Galaxy A");
  });

  it("removeVersion drops the row", () => {
    const a = pushVersion("Gone", config);
    removeVersion(a.id);
    assert.equal(getVersion(a.id), null);
  });
});
