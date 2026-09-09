import { test, expect } from "vitest";
import {
  toJsonExport,
  toCsvExport,
  CSV_COLUMNS,
  type PerfExportPayload,
} from "./export.ts";
import type { PerfSample } from "./ring-buffer.ts";
import { summarize } from "./stats.ts";

function mkSample(over: Partial<PerfSample>): PerfSample {
  return {
    t: 1000,
    fps: 60,
    frameMs: 16.7,
    frameMsMinWindow: 16.7,
    frameMsMaxWindow: 16.7,
    computeMs: 5,
    renderMs: 5,
    other: 6.7,
    live: 100,
    sleeping: 0,
    cap: 65536,
    ramBytes: 2048,
    drawCalls: 3,
    drawnPoints: 100,
    nanCount: 0,
    oobCount: 0,
    ...over,
  };
}

const samples = [
  mkSample({ t: 1 }),
  // A slow frame: window extremes mirror its 33ms frame time so summarize()
  // derives the worst-case fps min from the honest frame-time extents.
  mkSample({ t: 2, fps: 30, frameMs: 33, frameMsMinWindow: 33, frameMsMaxWindow: 33 }),
];

function mkPayload(): PerfExportPayload {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    window: samples.length,
    summary: summarize(samples),
    system: {
      backend: "webgl",
      compute: "cpu",
      devicePixelRatio: 2,
      canvasWidth: 800,
      canvasHeight: 600,
      gpu: { available: false },
      device: { available: false },
      memory: { available: false },
    },
    samples,
  };
}

test("toJsonExport produces parseable JSON with expected keys", () => {
  const json = toJsonExport(mkPayload());
  const parsed = JSON.parse(json);
  expect(parsed.generatedAt).toBe("2026-01-01T00:00:00.000Z");
  expect(parsed.window).toBe(2);
  expect(parsed.samples.length).toBe(2);
  expect(parsed.system.backend).toBe("webgl");
  // fpsMin is derived from the worst frame-time extent (33ms) -> ~30.3fps,
  // consistent with the ms readouts rather than a raw sampled fps value.
  expect(parsed.summary.fpsMin).toBeCloseTo(1000 / 33, 5);
});

test("toCsvExport header matches CSV_COLUMNS", () => {
  const csv = toCsvExport(samples);
  const lines = csv.split("\n");
  expect(lines[0]).toBe(CSV_COLUMNS.join(","));
});

test("toCsvExport writes one row per sample with correct values", () => {
  const csv = toCsvExport(samples);
  const lines = csv.split("\n");
  expect(lines.length).toBe(samples.length + 1); // header + rows
  // Second data row: t=2, fps=30, frameMs=33
  const row2 = lines[2].split(",");
  const tIdx = CSV_COLUMNS.indexOf("t");
  const fpsIdx = CSV_COLUMNS.indexOf("fps");
  expect(row2[tIdx]).toBe("2");
  expect(row2[fpsIdx]).toBe("30");
});

test("toCsvExport on empty samples still emits header row", () => {
  const csv = toCsvExport([]);
  expect(csv).toBe(CSV_COLUMNS.join(","));
});
