import { test, expect, describe } from "vitest";

// Testing theoretical physics functions simulating what's in WGSL/JS physics
describe("Physics Boundaries & Restitution", () => {
  // A mock reflection function based on bounce logic
  function reflect(pos: number, vel: number, limit: number, rest: number): [number, number] {
    if (pos > limit) {
      return [limit, -Math.abs(vel) * rest];
    }
    if (pos < 0) {
      return [0, Math.abs(vel) * rest];
    }
    return [pos, vel];
  }

  test("Reflects correctly off positive boundary", () => {
    const [p, v] = reflect(1.2, 0.5, 1.0, 0.5);
    expect(p).toBe(1.0);
    expect(v).toBe(-0.25);
  });

  test("Reflects correctly off negative boundary", () => {
    const [p, v] = reflect(-0.2, -0.5, 1.0, 0.8);
    expect(p).toBe(0.0);
    expect(v).toBe(0.4);
  });

  test("No reflection when inside bounds", () => {
    const [p, v] = reflect(0.5, 0.5, 1.0, 1.0);
    expect(p).toBe(0.5);
    expect(v).toBe(0.5);
  });
});

describe("Grid Hash & SPH Setup", () => {
  function getCell(x: number, y: number, cellH: number): number {
    const cx = Math.max(0, Math.min(127, Math.floor(x / cellH)));
    const cy = Math.max(0, Math.min(127, Math.floor(y / cellH)));
    return cy * 128 + cx;
  }
  
  test("Calculates correct grid cell", () => {
    expect(getCell(0.05, 0.05, 0.1)).toBe(0);
    expect(getCell(0.15, 0.05, 0.1)).toBe(1);
    expect(getCell(0.05, 0.15, 0.1)).toBe(128);
  });
  
  test("Clamps correctly to boundaries", () => {
    expect(getCell(-0.1, -0.1, 0.1)).toBe(0);
    expect(getCell(20.0, 20.0, 0.1)).toBe(127 * 128 + 127);
  });
});

describe("Drag & Gravity Euler Integration", () => {
  function eulerStep(v: number, acc: number, dt: number, drag: number): number {
    let nextV = v + acc * dt;
    nextV -= nextV * drag * dt;
    return nextV;
  }
  
  test("Applies gravity correctly", () => {
    expect(eulerStep(0, 9.8, 1/60, 0)).toBeCloseTo(0.1633);
  });
  
  test("Applies drag correctly", () => {
    const v = eulerStep(10, 0, 1/60, 0.1);
    expect(v).toBeLessThan(10);
    expect(v).toBeCloseTo(9.983);
  });
});
