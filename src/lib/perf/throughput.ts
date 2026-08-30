/**
 * Human-readable label for the throughput metric, so the UI describes it
 * honestly instead of implying a directly measured counter.
 */
export const THROUGHPUT_LABEL = "particles updated/sec (live x fps)";

/**
 * Honest derived estimate of particle update throughput: the number of live
 * particles multiplied by the current frames-per-second. This is NOT a measured
 * counter, it is `live * fps` and is labelled as such in the UI. Returns 0 when
 * either input is non-positive or non-finite.
 */
export function particleThroughput(live: number, fps: number): number {
  if (!Number.isFinite(live) || !Number.isFinite(fps)) return 0;
  if (live <= 0 || fps <= 0) return 0;
  return live * fps;
}
