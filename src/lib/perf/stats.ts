import type { PerfSample } from "./ring-buffer.ts";

/**
 * The "other" slice of a frame: time not attributed to compute or render.
 * Clamped to >= 0 so measurement jitter (compute+render slightly exceeding the
 * measured frame time) never yields a negative slice.
 */
export function otherFrameMs(
  frameMs: number,
  computeMs: number,
  renderMs: number,
): number {
  return Math.max(0, frameMs - computeMs - renderMs);
}

/**
 * Linear-interpolated percentile of a numeric array. `p` is in [0, 100].
 * Accepts sorted or unsorted input (it copies + sorts ascending). Returns 0 for
 * empty input. p=50 -> median, p=95 -> 95th percentile of the VALUES given.
 *
 * Note on direction: this operates on the raw numbers. When called with FRAME
 * TIMES, a higher percentile == a worse (longer) frame. When called with FPS, a
 * higher percentile == a better (higher) framerate. The hub reports frame-time
 * percentiles (p95/p99 are the slow-frame tail).
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const sorted = values.slice().sort((a, b) => a - b);
  const clampedP = Math.max(0, Math.min(100, p));
  const rank = (clampedP / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/**
 * Mean of the worst `fraction` of FPS values, where "worst" == LOWEST fps.
 *
 * Convention: 1% low / 0.1% low are gaming-style stutter metrics. The worst
 * frames are the ones that took the longest to render, i.e. the LOWEST fps. We
 * take the bottom `fraction` of the fps values (ascending sort, lowest first)
 * and average them. With few samples we still average at least one value so the
 * result is defined (never NaN). Returns 0 for empty input.
 */
export function lowPercentile(fpsValues: number[], fraction: number): number {
  if (fpsValues.length === 0) return 0;
  const sorted = fpsValues.slice().sort((a, b) => a - b); // lowest fps first == worst
  const n = Math.max(1, Math.floor(sorted.length * fraction));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i];
  return sum / n;
}

/** Mean of the worst 1% of frames (lowest 1% of fps). */
export function onePercentLow(fpsValues: number[]): number {
  return lowPercentile(fpsValues, 0.01);
}

/** Mean of the worst 0.1% of frames (lowest 0.1% of fps). */
export function pointOnePercentLow(fpsValues: number[]): number {
  return lowPercentile(fpsValues, 0.001);
}

export type PerfSummary = {
  fpsCur: number;
  fpsAvg: number;
  fpsMin: number;
  fpsMax: number;
  frameMsCur: number;
  frameMsAvg: number;
  frameMsMin: number;
  frameMsMax: number;
  /** Frame-time percentiles (ms). Higher == slower frame. */
  p50: number;
  p95: number;
  p99: number;
  /** Mean fps of the worst 1% / 0.1% of frames. */
  onePctLow: number;
  pointOnePctLow: number;
  /** Frames whose frame time exceeded the dropped-frame threshold. */
  droppedFrames: number;
  /** Longest single frame time observed (ms). */
  longestFrameMs: number;
};

/**
 * Threshold above which a frame counts as "dropped": frames slower than 50fps
 * (i.e. > 1000/50 = 20ms) are flagged as a hitch.
 */
export const DROPPED_FRAME_MS = 1000 / 50;

const ZERO_SUMMARY: PerfSummary = {
  fpsCur: 0,
  fpsAvg: 0,
  fpsMin: 0,
  fpsMax: 0,
  frameMsCur: 0,
  frameMsAvg: 0,
  frameMsMin: 0,
  frameMsMax: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  onePctLow: 0,
  pointOnePctLow: 0,
  droppedFrames: 0,
  longestFrameMs: 0,
};

/**
 * Derive aggregate stats from a window of samples (oldest -> newest). Returns an
 * all-zero summary for empty input; never produces NaN/undefined.
 */
export function summarize(samples: PerfSample[]): PerfSummary {
  if (samples.length === 0) return { ...ZERO_SUMMARY };

  const fps: number[] = [];
  const frameMs: number[] = [];
  let fpsSum = 0;
  let frameSum = 0;
  let fpsMin = Infinity;
  let fpsMax = -Infinity;
  let frameMin = Infinity;
  let frameMax = -Infinity;
  let dropped = 0;

  for (const s of samples) {
    fps.push(s.fps);
    frameMs.push(s.frameMs);
    fpsSum += s.fps;
    frameSum += s.frameMs;
    if (s.fps < fpsMin) fpsMin = s.fps;
    if (s.fps > fpsMax) fpsMax = s.fps;
    if (s.frameMs < frameMin) frameMin = s.frameMs;
    if (s.frameMs > frameMax) frameMax = s.frameMs;
    if (s.frameMs > DROPPED_FRAME_MS) dropped += 1;
  }

  const n = samples.length;
  return {
    fpsCur: samples[n - 1].fps,
    fpsAvg: fpsSum / n,
    fpsMin,
    fpsMax,
    frameMsCur: samples[n - 1].frameMs,
    frameMsAvg: frameSum / n,
    frameMsMin: frameMin,
    frameMsMax: frameMax,
    p50: percentile(frameMs, 50),
    p95: percentile(frameMs, 95),
    p99: percentile(frameMs, 99),
    onePctLow: onePercentLow(fps),
    pointOnePctLow: pointOnePercentLow(fps),
    droppedFrames: dropped,
    longestFrameMs: frameMax,
  };
}

/**
 * Default frame-time histogram bucket edges in ms. Each bucket is [edge, next):
 *   [0, 8.3)    faster than 120fps
 *   [8.3, 16.7) 60-120fps
 *   [16.7, 33.3) 30-60fps
 *   [33.3, 50)  20-30fps
 *   [50, 100)   10-20fps
 *   [100, Inf)  worse than 10fps
 */
export const DEFAULT_HISTOGRAM_EDGES = [0, 8.3, 16.7, 33.3, 50, 100, Infinity];

export type HistogramBin = {
  /** Inclusive lower edge (ms). */
  lo: number;
  /** Exclusive upper edge (ms), may be Infinity. */
  hi: number;
  count: number;
};

/**
 * Bucket frame times into fixed bins defined by `edges` (ascending, length
 * >= 2). Bin i covers [edges[i], edges[i+1]). Values below the first edge fall
 * in the first bin; values at/above the last finite edge fall in the last bin.
 * The sum of all bin counts equals values.length. Empty input -> all-zero bins.
 */
export function histogram(
  values: number[],
  edges: number[] = DEFAULT_HISTOGRAM_EDGES,
): HistogramBin[] {
  const bins: HistogramBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    bins.push({ lo: edges[i], hi: edges[i + 1], count: 0 });
  }
  if (bins.length === 0) return bins;

  for (const v of values) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (v >= bins[i].lo && v < bins[i].hi) {
        bins[i].count += 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Below first lo -> first bin; at/above last hi -> last bin.
      if (v < bins[0].lo) bins[0].count += 1;
      else bins[bins.length - 1].count += 1;
    }
  }
  return bins;
}
