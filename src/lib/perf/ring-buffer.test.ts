import { test, expect } from "vitest";
import {
  RingBuffer,
  WINDOW,
  sampleFromTelemetry,
  type PerfSample,
} from "./ring-buffer.ts";

test("WINDOW is a fixed positive capacity", () => {
  expect(WINDOW).toBe(120);
});

test("ring buffer reports capacity and starts empty", () => {
  const rb = new RingBuffer<number>(4);
  expect(rb.capacity).toBe(4);
  expect(rb.size).toBe(0);
  expect(rb.last()).toBeUndefined();
  expect(rb.toArray()).toEqual([]);
});

test("ring buffer preserves insertion order before full", () => {
  const rb = new RingBuffer<number>(4);
  rb.push(1);
  rb.push(2);
  rb.push(3);
  expect(rb.size).toBe(3);
  expect(rb.toArray()).toEqual([1, 2, 3]);
  expect(rb.last()).toBe(3);
});

test("ring buffer wraps at capacity and preserves oldest->newest order", () => {
  const rb = new RingBuffer<number>(3);
  rb.push(1);
  rb.push(2);
  rb.push(3);
  rb.push(4); // overwrites 1
  rb.push(5); // overwrites 2
  expect(rb.size).toBe(3);
  expect(rb.capacity).toBe(3);
  expect(rb.toArray()).toEqual([3, 4, 5]);
  expect(rb.last()).toBe(5);
});

test("ring buffer never grows beyond capacity over many pushes", () => {
  const rb = new RingBuffer<number>(WINDOW);
  for (let i = 0; i < WINDOW * 5; i++) rb.push(i);
  expect(rb.size).toBe(WINDOW);
  const arr = rb.toArray();
  expect(arr.length).toBe(WINDOW);
  expect(arr[0]).toBe(WINDOW * 5 - WINDOW);
  expect(arr[arr.length - 1]).toBe(WINDOW * 5 - 1);
});

test("ring buffer clear resets to empty", () => {
  const rb = new RingBuffer<number>(3);
  rb.push(1);
  rb.push(2);
  rb.clear();
  expect(rb.size).toBe(0);
  expect(rb.toArray()).toEqual([]);
  expect(rb.last()).toBeUndefined();
  rb.push(9);
  expect(rb.toArray()).toEqual([9]);
});

test("ring buffer coerces bad capacity to at least 1", () => {
  const rb = new RingBuffer<number>(0);
  expect(rb.capacity).toBe(1);
  rb.push(1);
  rb.push(2);
  expect(rb.toArray()).toEqual([2]);
});

test("sampleFromTelemetry computes clamped 'other' and copies fields", () => {
  const s: PerfSample = sampleFromTelemetry(
    {
      fps: 60,
      frameMs: 16,
      computeMs: 6,
      renderMs: 4,
      live: 1000,
      sleeping: 5,
      cap: 65536,
      ramBytes: 2048,
      drawCalls: 3,
      drawnPoints: 1000,
      nanCount: 0,
      oobCount: 2,
    },
    123,
  );
  expect(s.t).toBe(123);
  expect(s.other).toBe(6); // 16 - 6 - 4
  expect(s.fps).toBe(60);
  expect(s.drawCalls).toBe(3);
  expect(s.oobCount).toBe(2);
});

test("sampleFromTelemetry clamps negative 'other' to 0", () => {
  const s = sampleFromTelemetry(
    {
      fps: 60,
      frameMs: 10,
      computeMs: 8,
      renderMs: 5,
      live: 0,
      sleeping: 0,
      cap: 0,
      ramBytes: 0,
      drawCalls: 0,
      drawnPoints: 0,
      nanCount: 0,
      oobCount: 0,
    },
    0,
  );
  expect(s.other).toBe(0);
});
