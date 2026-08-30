import { test, expect } from "vitest";
import {
  otherFrameMs,
  percentile,
  onePercentLow,
  pointOnePercentLow,
  lowPercentile,
  summarize,
  histogram,
  DEFAULT_HISTOGRAM_EDGES,
} from "./stats.ts";
import type { PerfSample } from "./ring-buffer.ts";
import { particleThroughput, THROUGHPUT_LABEL } from "./throughput.ts";

function mkSample(over: Partial<PerfSample>): PerfSample {
  return {
    t: 0,
    fps: 60,
    frameMs: 16.7,
    computeMs: 5,
    renderMs: 5,
    other: 6.7,
    live: 100,
    sleeping: 0,
    cap: 65536,
    ramBytes: 0,
    drawCalls: 0,
    drawnPoints: 0,
    nanCount: 0,
    oobCount: 0,
    ...over,
  };
}

test("otherFrameMs subtracts compute+render", () => {
  expect(otherFrameMs(16, 6, 4)).toBe(6);
});

test("otherFrameMs clamps negatives to 0", () => {
  expect(otherFrameMs(10, 8, 5)).toBe(0);
});

test("percentile on empty is 0, single element returns it", () => {
  expect(percentile([], 50)).toBe(0);
  expect(percentile([42], 99)).toBe(42);
});

test("percentile computes median and tail on known array", () => {
  const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  expect(percentile(vals, 50)).toBeCloseTo(5.5, 5);
  expect(percentile(vals, 0)).toBe(1);
  expect(percentile(vals, 100)).toBe(10);
});

test("percentile accepts unsorted input", () => {
  expect(percentile([10, 1, 5, 3], 0)).toBe(1);
  expect(percentile([10, 1, 5, 3], 100)).toBe(10);
});

test("1% low / 0.1% low average the worst (lowest) fps", () => {
  // 100 fps values 1..100; worst 1% (1 value) = 1; worst 0.1% still >=1 value = 1
  const fps = Array.from({ length: 100 }, (_, i) => i + 1);
  expect(onePercentLow(fps)).toBe(1);
  expect(pointOnePercentLow(fps)).toBe(1);
});

test("lowPercentile averages bottom fraction", () => {
  const fps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  // bottom 20% -> 2 lowest values 10, 20 -> mean 15
  expect(lowPercentile(fps, 0.2)).toBe(15);
});

test("lowPercentile on empty is 0", () => {
  expect(lowPercentile([], 0.01)).toBe(0);
  expect(onePercentLow([])).toBe(0);
});

test("summarize on empty returns zeros not NaN", () => {
  const s = summarize([]);
  for (const v of Object.values(s)) {
    expect(Number.isNaN(v)).toBe(false);
    expect(v).toBe(0);
  }
});

test("summarize computes cur/avg/min/max and dropped frames", () => {
  const samples = [
    mkSample({ fps: 60, frameMs: 16 }),
    mkSample({ fps: 30, frameMs: 33 }), // dropped (>20ms)
    mkSample({ fps: 120, frameMs: 8 }),
  ];
  const s = summarize(samples);
  expect(s.fpsCur).toBe(120); // last sample
  expect(s.fpsMin).toBe(30);
  expect(s.fpsMax).toBe(120);
  expect(s.fpsAvg).toBeCloseTo((60 + 30 + 120) / 3, 5);
  expect(s.frameMsCur).toBe(8);
  expect(s.frameMsMin).toBe(8);
  expect(s.frameMsMax).toBe(33);
  expect(s.longestFrameMs).toBe(33);
  expect(s.droppedFrames).toBe(1);
});

test("histogram bins sum to input length", () => {
  const values = [1, 9, 17, 34, 60, 200, 5];
  const bins = histogram(values);
  const total = bins.reduce((acc, b) => acc + b.count, 0);
  expect(total).toBe(values.length);
  expect(bins.length).toBe(DEFAULT_HISTOGRAM_EDGES.length - 1);
});

test("histogram lands values in the correct bins", () => {
  // edges [0,8.3,16.7,33.3,50,100,Inf]
  const bins = histogram([5, 10, 20, 40, 70, 150]);
  expect(bins[0].count).toBe(1); // 5 in [0,8.3)
  expect(bins[1].count).toBe(1); // 10 in [8.3,16.7)
  expect(bins[2].count).toBe(1); // 20 in [16.7,33.3)
  expect(bins[3].count).toBe(1); // 40 in [33.3,50)
  expect(bins[4].count).toBe(1); // 70 in [50,100)
  expect(bins[5].count).toBe(1); // 150 in [100,Inf)
});

test("histogram places out-of-range values in edge bins", () => {
  const bins = histogram([-5, 99999]);
  expect(bins[0].count).toBe(1); // below first edge
  expect(bins[bins.length - 1].count).toBe(1); // above last finite edge
});

test("histogram empty input gives all-zero bins", () => {
  const bins = histogram([]);
  expect(bins.every((b) => b.count === 0)).toBe(true);
});

test("particleThroughput is live x fps and honestly labelled", () => {
  expect(particleThroughput(1000, 60)).toBe(60000);
  expect(particleThroughput(0, 60)).toBe(0);
  expect(particleThroughput(1000, 0)).toBe(0);
  expect(particleThroughput(NaN, 60)).toBe(0);
  expect(THROUGHPUT_LABEL).toContain("live x fps");
});
