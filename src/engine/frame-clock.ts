/**
 * Pure, dependency-free frame-timing math for the engine's telemetry. Kept in
 * its own leaf module (no GPU/DOM imports) so it is unit-testable in node.
 *
 * The performance HUD used to derive its headline FPS and min/max from sparse,
 * aliased 140ms snapshots of raw per-frame time, so a single lucky/slow frame
 * read as 100+/44fps even when the sim was steady at ~60. This module gives the
 * engine two honest, cheap-to-maintain quantities updated EVERY frame:
 *   - a smoothed frame time (EMA) -> a stable "current FPS" consistent with MS
 *   - true min/max frame time over the window between HUD reads
 */

/** Smoothing factor for the frame-time EMA. Lower == smoother/slower to react. */
export const FRAME_MS_EMA_ALPHA = 0.1;

/** A frame time outside this range is treated as a glitch and ignored for
 * smoothing/extents (tab was backgrounded, debugger paused, first frame, etc.). */
export const MIN_VALID_FRAME_MS = 0;
export const MAX_VALID_FRAME_MS = 1000;

export function isValidFrameMs(frameMs: number): boolean {
  return (
    Number.isFinite(frameMs) &&
    frameMs > MIN_VALID_FRAME_MS &&
    frameMs < MAX_VALID_FRAME_MS
  );
}

/**
 * Update an exponential moving average of frame time with a new sample. Invalid
 * samples (see {@link isValidFrameMs}) leave the average unchanged so a paused
 * tab or first frame never poisons the readout. `prevEma <= 0` seeds directly.
 */
export function updateFrameMsEma(
  prevEma: number,
  frameMs: number,
  alpha: number = FRAME_MS_EMA_ALPHA,
): number {
  if (!isValidFrameMs(frameMs)) return prevEma;
  if (!(prevEma > 0)) return frameMs;
  return prevEma * (1 - alpha) + frameMs * alpha;
}

/** Frames-per-second implied by a frame time in ms. 0 for a non-positive ms. */
export function fpsFromFrameMs(frameMs: number): number {
  return frameMs > 0 ? 1000 / frameMs : 0;
}

/** Default number of recent frames the extents window covers (~2s at 60fps). */
export const FRAME_EXTENTS_WINDOW = 120;

/**
 * True per-frame min/max frame time over a fixed rolling window of the most
 * recent N frames. `observe()` runs EVERY frame (the engine sees every frame,
 * unlike the perf hub which only polls at ~7Hz), so the min/max reflect the
 * real best/worst frame over the last ~N frames rather than a single aliased
 * snapshot that made the HUD's min/max strobe. Invalid frames are skipped.
 *
 * Implemented as a tiny fixed ring of frame times; min/max are recomputed over
 * the ring on read (N is small and reads are ~7Hz, so this is cheap).
 */
export class FrameExtents {
  private readonly capacity: number;
  private readonly ring: number[] = [];
  private head = 0;

  constructor(capacity: number = FRAME_EXTENTS_WINDOW) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  observe(frameMs: number): void {
    if (!isValidFrameMs(frameMs)) return;
    if (this.ring.length < this.capacity) this.ring.push(frameMs);
    else {
      this.ring[this.head] = frameMs;
      this.head = (this.head + 1) % this.capacity;
    }
  }

  get hasData(): boolean {
    return this.ring.length > 0;
  }

  /**
   * Min/max frame time over the current window. Falls back to `fallbackMs` for
   * both when no valid frame has been observed yet, so the reader never sees
   * Infinity.
   */
  read(fallbackMs: number): { min: number; max: number } {
    if (this.ring.length === 0) return { min: fallbackMs, max: fallbackMs };
    let min = Infinity;
    let max = -Infinity;
    for (const v of this.ring) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  }
}
