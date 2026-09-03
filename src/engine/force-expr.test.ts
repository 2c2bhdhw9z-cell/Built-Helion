import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyCustomForce, evalForce, forceExprOk, type ForceContext } from "./force-expr.ts";

const ctx: ForceContext = { x: 0.25, y: 0.5, vx: 0, vy: 0, t: 0, r: 0.25, bass: 0.5 };

describe("force expressions", () => {
  it("evaluates arithmetic and names", () => {
    assert.equal(evalForce("x + y", ctx), 0.75);
    assert.equal(evalForce("2 * x", ctx), 0.5);
    assert.ok(Math.abs(evalForce("sin(0)", ctx)) < 1e-9);
    assert.equal(evalForce("min(x, y)", ctx), 0.25);
  });

  it("rejects hostile input", () => {
    assert.equal(forceExprOk("constructor"), false);
    assert.equal(forceExprOk("x; y"), false);
    assert.equal(evalForce("alert(1)", ctx), 0);
    assert.equal(forceExprOk("sin(x) + cos(y)"), true);
  });

  it("applies radial / swirl presets", () => {
    const radial = applyCustomForce("radial", 1, "", "", 1, 0.5, 0, 0);
    assert.ok(radial.ax > 0);
    const swirl = applyCustomForce("swirl", 1, "", "", 1, 0.5, 0, 0);
    assert.ok(swirl.ay > 0);
    const off = applyCustomForce("off", 1, "1", "1", 0.2, 0.2, 0, 0);
    assert.equal(off.ax, 0);
  });
});
