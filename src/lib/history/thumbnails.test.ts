import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { THUMB_MAX_DIM, thumbSize, timelineEntries } from "./thumbnails.ts";
import type { VersionEntry } from "./versions.ts";

// thumbnails.ts type-imports versions.ts (which imports @/lib/creations/types);
// only timelineEntries touches VersionEntry shape at runtime and it's pure data,
// but building the test fixtures needs a CreationConfig, so we resolve the @/
// alias via the shared loader and build a config from the engine defaults.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type EngineTypes = typeof import("../../engine/types.ts");
let config: VersionEntry["config"];

before(async () => {
  const DEFAULT_PARAMS = (await import("../../engine/types.ts") as EngineTypes).DEFAULT_PARAMS;
  config = {
    params: { ...DEFAULT_PARAMS },
    spawnKind: "galaxy",
    spawnCount: 1000,
    speed: 1,
    cap: 65536,
  };
});

describe("thumbSize (pure)", () => {
  it("fits a wide source into the max box preserving aspect", () => {
    assert.deepEqual(thumbSize({ width: 1920, height: 1080 }, 96), { width: 96, height: 54 });
  });

  it("fits a tall source", () => {
    assert.deepEqual(thumbSize({ width: 1080, height: 1920 }, 96), { width: 54, height: 96 });
  });

  it("never upscales a small source", () => {
    assert.deepEqual(thumbSize({ width: 40, height: 20 }, 96), { width: 40, height: 20 });
  });

  it("guards degenerate sizes to at least 1px", () => {
    assert.deepEqual(thumbSize({ width: 0, height: 0 }, 96), { width: 1, height: 1 });
  });

  it("defaults to THUMB_MAX_DIM", () => {
    const s = thumbSize({ width: 200, height: 200 });
    assert.equal(Math.max(s.width, s.height), THUMB_MAX_DIM);
  });
});

describe("timelineEntries selector (pure)", () => {
  const mk = (id: string, at: number, thumb?: string): VersionEntry => ({
    id,
    at,
    name: id,
    config,
    ...(thumb ? { thumb } : {}),
  });

  it("orders newest-first regardless of input order", () => {
    const rows = [mk("a", 100), mk("c", 300), mk("b", 200)];
    assert.deepEqual(
      timelineEntries(rows).map((e) => e.id),
      ["c", "b", "a"],
    );
  });

  it("caps to the limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => mk(`v${i}`, i));
    assert.equal(timelineEntries(rows, 12).length, 12);
    assert.equal(timelineEntries(rows, 5).length, 5);
  });

  it("carries the thumb dataURL through", () => {
    const rows = [mk("a", 1, "data:image/jpeg;base64,AAA")];
    assert.equal(timelineEntries(rows)[0]?.thumb, "data:image/jpeg;base64,AAA");
  });

  it("is a no-op for an empty list", () => {
    assert.deepEqual(timelineEntries([]), []);
  });

  it("does not mutate the input array order", () => {
    const rows = [mk("a", 1), mk("b", 2)];
    timelineEntries(rows);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["a", "b"],
    );
  });
});
