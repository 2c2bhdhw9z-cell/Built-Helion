import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSvg } from "./svg.ts";

describe("parseSvg", () => {
  it("samples M/L path points and normalizes into [0,1] with Y flipped", () => {
    const svg = `<svg><path d="M 0 0 L 10 0 L 10 10 L 0 10 Z" /></svg>`;
    const rows = parseSvg(svg);
    assert.ok(rows.length >= 4);
    assert.ok(rows.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
    // The point at SVG y=0 (top) maps to y=1 (upright), y=10 (bottom) maps to 0.
    const top = rows[0]!; // M 0 0
    assert.equal(top.x, 0);
    assert.equal(top.y, 1);
  });

  it("handles relative commands (m/l/h/v)", () => {
    const svg = `<svg><path d="m 0 0 l 5 0 h 5 v 5" /></svg>`;
    const rows = parseSvg(svg);
    assert.ok(rows.length >= 4);
    assert.ok(rows.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  });

  it("flattens cubic (C) and quadratic (Q) curves into segments", () => {
    const c = parseSvg(`<svg><path d="M 0 0 C 0 10 10 10 10 0" /></svg>`);
    const q = parseSvg(`<svg><path d="M 0 0 Q 5 10 10 0" /></svg>`);
    // A single move + curve yields many sampled segment points, not just 2.
    assert.ok(c.length > 5, "cubic is flattened into multiple points");
    assert.ok(q.length > 5, "quadratic is flattened into multiple points");
    assert.ok([...c, ...q].every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  });

  it("extracts polygon and polyline points", () => {
    const poly = parseSvg(`<svg><polygon points="0,0 10,0 5,10" /></svg>`);
    assert.equal(poly.length, 3);
    const line = parseSvg(`<svg><polyline points="0 0 10 10" /></svg>`);
    assert.equal(line.length, 2);
  });

  it("ignores unsupported commands (A arcs) gracefully", () => {
    const rows = parseSvg(`<svg><path d="M 0 0 A 5 5 0 0 1 10 10 L 10 0" /></svg>`);
    // The M and the L still register; the arc is skipped without throwing.
    assert.ok(rows.length >= 2);
  });

  it("returns empty for non-SVG or empty input", () => {
    assert.deepEqual(parseSvg(""), []);
    assert.deepEqual(parseSvg("<html></html>"), []);
    assert.deepEqual(parseSvg("<svg></svg>"), []);
  });

  it("returns empty for a path with no numeric data", () => {
    assert.deepEqual(parseSvg(`<svg><path d="" /></svg>`), []);
  });

  it("handles single-quoted attributes", () => {
    const rows = parseSvg(`<svg><path d='M 0 0 L 2 2' /></svg>`);
    assert.equal(rows.length, 2);
  });
});
