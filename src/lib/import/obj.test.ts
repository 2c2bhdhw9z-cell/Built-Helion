import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseObjVertices } from "./obj.ts";

describe("parseObjVertices", () => {
  it("reads OBJ v lines and unit-normalizes", () => {
    const rows = parseObjVertices(`
# cube-ish
v 0 0 0
v 2 0 0
v 0 1 0
v 0 0 3
`);
    assert.equal(rows.length, 4);
    assert.ok(rows.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  });

  it("accepts XYZ rows and skips faces", () => {
    const rows = parseObjVertices("0 0 0\n1 2 3\nf 1 2 3");
    assert.equal(rows.length, 2);
  });
});
