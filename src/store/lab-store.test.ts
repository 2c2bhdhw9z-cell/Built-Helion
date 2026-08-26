import { test, expect } from "vitest";
import { useLab } from "./lab-store.ts";
import { DEFAULT_PARAMS } from "@/engine/types.ts";

test("lab-store initializes with default state", () => {
  const state = useLab.getState();
  expect(state.params).toEqual(DEFAULT_PARAMS);
  expect(state.paused).toBe(false);
  expect(state.speed).toBe(1);
  expect(state.tool).toBe("attract");
  expect(state.tab).toBe("physics");
});

test("lab-store updates specific parameter", () => {
  useLab.getState().setParam("gravityX", 1.5);
  const state = useLab.getState();
  expect(state.params.gravityX).toBe(1.5);
});

test("lab-store updates multiple parameters via patch", () => {
  useLab.getState().patchParams({ gravityY: -1, mass: 2.5 });
  const state = useLab.getState();
  expect(state.params.gravityY).toBe(-1);
  expect(state.params.mass).toBe(2.5);
});

test("lab-store manages brush state", () => {
  useLab.getState().setBrush(0.5, 1.2);
  const state = useLab.getState();
  expect(state.brushRadius).toBe(0.5);
  expect(state.brushStrength).toBe(1.2);
});

test("lab-store sets pointer state", () => {
  useLab.getState().setPointer({ x: 0.1, y: 0.2, down: true });
  const state = useLab.getState();
  expect(state.pointer.x).toBe(0.1);
  expect(state.pointer.y).toBe(0.2);
  expect(state.pointer.down).toBe(true);
});

test("lab-store caps spawn count constraints", () => {
  useLab.getState().setSpawnCount(10); // below min
  expect(useLab.getState().spawnCount).toBe(50);
  
  useLab.getState().setSpawnCount(500000); // above max
  expect(useLab.getState().spawnCount).toBe(200000);
});

test("lab-store clears simulation", () => {
  const initialId = useLab.getState().clearId;
  useLab.getState().clearSim();
  expect(useLab.getState().clearId).toBe(initialId + 1);
});

test("lab-store triggers generator", () => {
  const initialId = useLab.getState().spawnId;
  useLab.getState().runGenerator("ring");
  const state = useLab.getState();
  expect(state.spawnKind).toBe("ring");
  expect(state.spawnId).toBe(initialId + 1);
});
