import type { Telemetry } from "@/engine/types.ts";

/**
 * Number of frames retained by the perf hub's rolling window.
 * Fixed capacity: the ring buffer NEVER grows beyond this, it overwrites the
 * oldest sample once full. 120 frames == ~2s at 60fps.
 */
export const WINDOW = 120;

/**
 * One captured frame of telemetry. Only the numeric fields the hub graphs
 * actually need are stored (no strings, no arrays) so the buffer stays a
 * fixed-size record set. `other` is the derived non-compute/non-render frame
 * time (see {@link ../perf/stats.otherFrameMs}). `t` is a timestamp in ms.
 */
export type PerfSample = {
  /** Capture timestamp in ms (performance.now / Date.now domain, monotonic-ish). */
  t: number;
  fps: number;
  frameMs: number;
  computeMs: number;
  renderMs: number;
  /** frameMs - computeMs - renderMs, clamped to >= 0. */
  other: number;
  live: number;
  sleeping: number;
  cap: number;
  ramBytes: number;
  drawCalls: number;
  drawnPoints: number;
  nanCount: number;
  oobCount: number;
};

/** Fields on Telemetry that map 1:1 into a PerfSample (i.e. excludes t/other). */
type TelemetryNumericSubset = Pick<
  Telemetry,
  | "fps"
  | "frameMs"
  | "computeMs"
  | "renderMs"
  | "live"
  | "sleeping"
  | "cap"
  | "ramBytes"
  | "drawCalls"
  | "drawnPoints"
  | "nanCount"
  | "oobCount"
>;

/**
 * Build a PerfSample from a telemetry snapshot. `other` is computed here so the
 * buffer always stores the clamped value. Pure; no side effects.
 */
export function sampleFromTelemetry(
  tel: TelemetryNumericSubset,
  t: number,
): PerfSample {
  const other = Math.max(0, tel.frameMs - tel.computeMs - tel.renderMs);
  return {
    t,
    fps: tel.fps,
    frameMs: tel.frameMs,
    computeMs: tel.computeMs,
    renderMs: tel.renderMs,
    other,
    live: tel.live,
    sleeping: tel.sleeping,
    cap: tel.cap,
    ramBytes: tel.ramBytes,
    drawCalls: tel.drawCalls,
    drawnPoints: tel.drawnPoints,
    nanCount: tel.nanCount,
    oobCount: tel.oobCount,
  };
}

/**
 * Fixed-capacity ring buffer for per-frame perf samples. Storage is a
 * pre-allocated slot array that never grows; once full, `push` overwrites the
 * oldest slot. `toArray()` always yields oldest -> newest.
 */
export class RingBuffer<T> {
  readonly capacity: number;
  private readonly slots: (T | undefined)[];
  /** Index where the next push will write. */
  private head = 0;
  /** Current number of valid entries (<= capacity). */
  private count = 0;

  constructor(capacity: number = WINDOW) {
    // Guard against nonsense capacities; always keep at least 1 slot.
    this.capacity = Math.max(1, Math.floor(capacity));
    this.slots = new Array<T | undefined>(this.capacity).fill(undefined);
  }

  /** Number of valid entries currently stored. */
  get size(): number {
    return this.count;
  }

  /** Append one sample, overwriting the oldest if at capacity. */
  push(item: T): void {
    this.slots[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  /** Reset to empty (retains capacity). */
  clear(): void {
    this.slots.fill(undefined);
    this.head = 0;
    this.count = 0;
  }

  /** Most-recently pushed item, or undefined if empty. */
  last(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.slots[idx];
  }

  /** Copy of contents ordered oldest -> newest. */
  toArray(): T[] {
    const out: T[] = [];
    // Oldest entry index: when full it's `head`; when not full it's 0.
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      out.push(this.slots[idx] as T);
    }
    return out;
  }
}
