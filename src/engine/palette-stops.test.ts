import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStops,
  usesStops,
  sampleStopsN,
  bakeStopsN,
  quantizeColors,
  colorsToStops,
  rgbToHex,
  type PaletteStop,
} from "./palette-stops.ts";

describe("palette-stops: normalizeStops", () => {
  it("sorts by position and lowercases colors", () => {
    const out = normalizeStops([
      { pos: 0.8, color: "#FF0000" },
      { pos: 0.1, color: "#00FF00" },
    ]);
    assert.deepEqual(out, [
      { pos: 0.1, color: "#00ff00" },
      { pos: 0.8, color: "#ff0000" },
    ]);
  });

  it("drops invalid colors and non-finite positions and clamps range", () => {
    const out = normalizeStops([
      { pos: 0.5, color: "not-a-color" },
      { pos: Number.NaN, color: "#123456" },
      { pos: -3, color: "#abcdef" },
      { pos: 5, color: "#000000" },
    ] as PaletteStop[]);
    assert.deepEqual(out, [
      { pos: 0, color: "#abcdef" },
      { pos: 1, color: "#000000" },
    ]);
  });
});

describe("palette-stops: usesStops", () => {
  it("requires at least two valid stops", () => {
    assert.equal(usesStops(null), false);
    assert.equal(usesStops([]), false);
    assert.equal(usesStops([{ pos: 0, color: "#ffffff" }]), false);
    assert.equal(usesStops([{ pos: 0, color: "#fff000" }, { pos: 1, color: "#000fff" }]), true);
  });
});

describe("palette-stops: sampleStopsN", () => {
  const stops: PaletteStop[] = [
    { pos: 0, color: "#000000" },
    { pos: 0.5, color: "#ff0000" },
    { pos: 1, color: "#ffffff" },
  ];

  it("returns black for empty and the color for single-stop", () => {
    assert.deepEqual(sampleStopsN([], 0.5), [0, 0, 0]);
    const one = sampleStopsN([{ pos: 0.3, color: "#ff0000" }], 0.9);
    assert.ok(Math.abs(one[0] - 1) < 1e-6 && one[1] === 0 && one[2] === 0);
  });

  it("hits endpoints exactly", () => {
    assert.deepEqual(sampleStopsN(stops, 0), [0, 0, 0]);
    const end = sampleStopsN(stops, 1);
    assert.ok(end.every((c) => Math.abs(c - 1) < 1e-6));
  });

  it("step-holds before first / after last", () => {
    assert.deepEqual(sampleStopsN(stops, -1), [0, 0, 0]);
    const after = sampleStopsN(stops, 2);
    assert.ok(after.every((c) => Math.abs(c - 1) < 1e-6));
  });

  it("interpolates at a midpoint between two stops", () => {
    // midpoint of 0 (#000000) and 0.5 (#ff0000) at t=0.25 => red 0.5
    const mid = sampleStopsN(stops, 0.25);
    assert.ok(Math.abs(mid[0] - 0.5) < 1e-6, `red ${mid[0]}`);
    assert.equal(mid[1], 0);
    assert.equal(mid[2], 0);
  });

  it("hits an exact interior stop", () => {
    const at = sampleStopsN(stops, 0.5);
    assert.ok(Math.abs(at[0] - 1) < 1e-6 && at[1] === 0 && at[2] === 0);
  });
});

describe("palette-stops: bakeStopsN", () => {
  it("produces a 256*4 RGBA LUT with correct endpoints", () => {
    const lut = bakeStopsN([
      { pos: 0, color: "#000000" },
      { pos: 1, color: "#ffffff" },
    ]);
    assert.equal(lut.length, 256 * 4);
    assert.equal(lut[0], 0);
    assert.equal(lut[3], 255); // alpha
    assert.equal(lut[255 * 4], 255);
  });

  it("applies a tint", () => {
    const lut = bakeStopsN([{ pos: 0, color: "#ffffff" }, { pos: 1, color: "#ffffff" }], "#ff0000");
    assert.equal(lut[0], 255);
    assert.equal(lut[1], 0);
    assert.equal(lut[2], 0);
  });
});

describe("palette-stops: quantizeColors", () => {
  it("returns the dominant colors ordered by population", () => {
    // 3 red pixels, 1 blue pixel
    const rgba = [
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
      0, 0, 255, 255,
    ];
    const out = quantizeColors(rgba, 2);
    assert.equal(out.length, 2);
    assert.equal(out[0], "#ff0000");
    assert.equal(out[1], "#0000ff");
  });

  it("ignores fully transparent pixels", () => {
    const rgba = [10, 20, 30, 0, 255, 0, 0, 255];
    const out = quantizeColors(rgba, 4);
    assert.equal(out.length, 1);
    assert.equal(out[0], "#ff0000");
  });

  it("caps the count", () => {
    const rgba = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255];
    assert.equal(quantizeColors(rgba, 1).length, 1);
  });
});

describe("palette-stops: colorsToStops", () => {
  it("spreads colors evenly with endpoints at 0 and 1", () => {
    const out = colorsToStops(["#ff0000", "#00ff00", "#0000ff"]);
    assert.deepEqual(
      out.map((s) => s.pos),
      [0, 0.5, 1],
    );
  });

  it("single color yields one stop at 0; empty yields empty", () => {
    assert.deepEqual(colorsToStops(["#ff0000"]), [{ pos: 0, color: "#ff0000" }]);
    assert.deepEqual(colorsToStops([]), []);
    assert.deepEqual(colorsToStops(["bogus"]), []);
  });
});

describe("palette-stops: rgbToHex", () => {
  it("clamps and pads channels", () => {
    assert.equal(rgbToHex(0, 0, 0), "#000000");
    assert.equal(rgbToHex(255, 255, 255), "#ffffff");
    assert.equal(rgbToHex(300, -5, 16), "#ff0010");
  });
});
