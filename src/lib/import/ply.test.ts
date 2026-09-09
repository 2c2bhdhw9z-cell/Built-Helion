import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePly } from "./ply.ts";

const ascii = (verts: string, count: number, props = "x\ny\nz") =>
  `ply
format ascii 1.0
element vertex ${count}
${props
    .split("\n")
    .map((p) => `property float ${p}`)
    .join("\n")}
end_header
${verts}`;

describe("parsePly", () => {
  it("reads ASCII vertices and unit-normalizes into [0,1]", () => {
    const rows = parsePly(ascii("0 0 0\n2 0 0\n0 1 0\n0 0 3", 4));
    assert.equal(rows.length, 4);
    assert.ok(rows.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  });

  it("respects the element vertex count (ignores trailing face lines)", () => {
    const text = `ply
format ascii 1.0
element vertex 2
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
1 1 1
3 0 1 2`;
    const rows = parsePly(text);
    assert.equal(rows.length, 2, "only the 2 declared vertices are read");
  });

  it("pulls x/y/z by their declared property order", () => {
    // Properties declared as z,y,x — the parser must index by name, not column.
    const text = `ply
format ascii 1.0
element vertex 2
property float z
property float y
property float x
end_header
5 0 0
5 1 2`;
    const rows = parsePly(text);
    assert.equal(rows.length, 2);
    // With x spanning 0..2 and y spanning 0..1, projection uses x/y; both in range.
    assert.ok(rows.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  });

  it("rejects binary PLY with a clear error", () => {
    const text = `ply
format binary_little_endian 1.0
element vertex 1
property float x
property float y
property float z
end_header
`;
    assert.throws(() => parsePly(text), /binary/i);
  });

  it("returns empty for non-PLY input", () => {
    assert.deepEqual(parsePly("not a ply file"), []);
    assert.deepEqual(parsePly(""), []);
  });

  it("returns empty when there is no header terminator", () => {
    assert.deepEqual(parsePly("ply\nformat ascii 1.0\nelement vertex 1"), []);
  });

  it("skips malformed vertex lines but keeps valid ones", () => {
    const rows = parsePly(ascii("0 0 0\nfoo bar baz\n1 1 1", 3));
    assert.equal(rows.length, 2);
  });

  it("bounds the vertex count", () => {
    // Declares a huge count but only supplies a few lines — never over-reads.
    const rows = parsePly(ascii("0 0 0\n1 1 1", 999999999));
    assert.equal(rows.length, 2);
  });
});
