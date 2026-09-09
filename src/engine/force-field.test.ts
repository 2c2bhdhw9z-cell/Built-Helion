import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_RES,
  FIELD_MAX_RES,
  createField,
  sampleField,
  paintField,
  clearField,
  fieldHasData,
  serializeField,
  deserializeField,
} from "./force-field.ts";

describe("force-field: createField", () => {
  it("makes a zero grid of the default resolution", () => {
    const f = createField();
    assert.equal(f.res, FIELD_RES);
    assert.equal(f.data.length, FIELD_RES * FIELD_RES * 2);
    assert.ok(f.data.every((v) => v === 0));
    assert.equal(fieldHasData(f), false);
  });

  it("clamps out-of-range resolutions", () => {
    assert.equal(createField(1).res, 2);
    assert.equal(createField(0).res, 2);
    assert.equal(createField(9999).res, FIELD_MAX_RES);
    assert.equal(createField(Number.NaN).res, 2);
  });
});

describe("force-field: sampleField", () => {
  it("returns the exact cell vector when sampling on a grid node", () => {
    const f = createField(4);
    // set cell (2,1) => index (1*4+2)*2 = 12
    f.data[12] = 0.5;
    f.data[13] = -0.25;
    const [vx, vy] = sampleField(f, 2 / 3, 1 / 3);
    assert.ok(Math.abs(vx - 0.5) < 1e-6);
    assert.ok(Math.abs(vy - -0.25) < 1e-6);
  });

  it("bilinearly interpolates between two horizontally adjacent cells", () => {
    const f = createField(2); // nodes at 0 and 1
    // cell (0,0) index 0, cell (1,0) index 2
    f.data[0] = 0;
    f.data[1] = 0;
    f.data[2] = 1;
    f.data[3] = 0;
    const [vx] = sampleField(f, 0.5, 0);
    assert.ok(Math.abs(vx - 0.5) < 1e-6);
  });

  it("clamps out-of-range sample positions to the edge", () => {
    const f = createField(2);
    f.data[0] = 3;
    f.data[1] = 7;
    const [vx, vy] = sampleField(f, -5, -5);
    assert.equal(vx, 3);
    assert.equal(vy, 7);
    const f2 = createField(2);
    f2.data[6] = 2; // cell (1,1) index (1*2+1)*2 = 6
    f2.data[7] = 4;
    const [ax, ay] = sampleField(f2, 5, 5);
    assert.equal(ax, 2);
    assert.equal(ay, 4);
  });

  it("returns zero for an empty field everywhere", () => {
    const f = createField(8);
    const [vx, vy] = sampleField(f, 0.37, 0.62);
    assert.equal(vx, 0);
    assert.equal(vy, 0);
  });
});

describe("force-field: paintField", () => {
  it("stamps the painted vector strongest at the center", () => {
    const f = createField(16);
    paintField(f, 0.5, 0.5, 1, 0, 0.3, 1);
    const [cx] = sampleField(f, 0.5, 0.5);
    const [ex] = sampleField(f, 0.5, 0.9);
    assert.ok(cx > 0.5, "center should be strongly painted");
    assert.ok(cx >= ex, "center at least as strong as edge");
    assert.ok(fieldHasData(f));
  });

  it("respects strength when blending", () => {
    const f = createField(8);
    paintField(f, 0.5, 0.5, 1, 0, 1, 0.5);
    const [cx] = sampleField(f, 0.5, 0.5);
    assert.ok(cx > 0 && cx < 1, `expected partial blend, got ${cx}`);
  });

  it("leaves cells outside the radius untouched", () => {
    const f = createField(16);
    paintField(f, 0.1, 0.1, 1, 1, 0.1, 1);
    const [vx, vy] = sampleField(f, 0.9, 0.9);
    assert.equal(vx, 0);
    assert.equal(vy, 0);
  });
});

describe("force-field: clearField", () => {
  it("zeroes all vectors", () => {
    const f = createField(8);
    paintField(f, 0.5, 0.5, 1, 1, 0.5, 1);
    assert.ok(fieldHasData(f));
    clearField(f);
    assert.equal(fieldHasData(f), false);
  });
});

describe("force-field: (de)serialize", () => {
  it("round-trips a painted field", () => {
    const f = createField(8);
    paintField(f, 0.4, 0.6, 0.5, -0.5, 0.3, 1);
    const ser = serializeField(f);
    assert.equal(ser.res, 8);
    assert.equal(ser.data.length, 8 * 8 * 2);
    const back = deserializeField(ser);
    assert.ok(back);
    assert.equal(back!.res, 8);
    for (let i = 0; i < f.data.length; i++) {
      assert.ok(Math.abs(back!.data[i]! - f.data[i]!) < 1e-6);
    }
  });

  it("returns null on garbage input", () => {
    assert.equal(deserializeField(null), null);
    assert.equal(deserializeField(42), null);
    assert.equal(deserializeField({}), null);
    assert.equal(deserializeField({ res: 8 }), null);
    assert.equal(deserializeField({ data: [] }), null);
  });

  it("coerces non-finite / missing entries to zero and clamps resolution", () => {
    const back = deserializeField({ res: 2, data: [1, Number.NaN, "x", null] });
    assert.ok(back);
    assert.equal(back!.res, 2);
    assert.equal(back!.data.length, 2 * 2 * 2);
    assert.equal(back!.data[0], 1);
    assert.equal(back!.data[1], 0);
    assert.equal(back!.data[2], 0);
    const huge = deserializeField({ res: 9999, data: [] });
    assert.equal(huge!.res, FIELD_MAX_RES);
  });
});
