import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseParticleCsv } from "./csv.ts";

describe("parseParticleCsv", () => {
  it("reads headered rows", () => {
    const rows = parseParticleCsv("x,y,vx,vy\n0.1,0.2,0,0\n0.3,0.4,1,2");
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.x, 0.1);
    assert.equal(rows[1]!.vy, 2);
  });

  it("skips junk lines", () => {
    const rows = parseParticleCsv("# comment\nnot,a,number\n0.5,0.5");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.x, 0.5);
  });
});
