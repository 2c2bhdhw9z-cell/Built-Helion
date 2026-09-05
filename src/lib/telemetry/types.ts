/**
 * Client-safe telemetry types. This file MUST stay free of any server-only
 * imports (no @/lib/db, no server.ts) so both the browser bundle (the opt-in
 * submit client) and the server functions can import it.
 *
 * PRIVACY BY DESIGN (Req 12.3, Property 12): `PerfSampleInput` lists the ONLY
 * fields a telemetry sample ever carries. There is deliberately NO account id
 * and NO email field — the shape simply has nowhere to put identity, so a
 * recorded sample can never carry one. The `telemetry_samples` table
 * (migration 0009) likewise has no user/email column.
 */

/**
 * A single anonymous performance sample submitted by an opted-in client. These
 * are the ONLY fields ever stored:
 *
 * - `fpsAvg`        — average frames-per-second over the sampled window
 * - `frameMsP95`    — 95th-percentile frame time in ms (the slow-frame tail)
 * - `droppedFrames` — count of frames that exceeded the dropped-frame threshold
 * - `particleBucket`— coarse bucket of the particle count (not the exact value)
 * - `deviceTier`    — coarse device/GPU tier label (a non-identifying string)
 *
 * No account id, no email, no session id, no free-form text — nothing that
 * could identify a user.
 */
export interface PerfSampleInput {
  fpsAvg: number;
  frameMsP95: number;
  droppedFrames: number;
  particleBucket: number;
  deviceTier: string;
}

/**
 * Aggregate performance statistics computed from stored samples, returned to an
 * admin by `getTelemetryAggregates()`. Derived purely from the non-identifying
 * fields above; carries no identity.
 */
export interface TelemetryAggregates {
  /** Number of samples the aggregates were computed from. */
  sampleCount: number;
  /** Mean of the per-sample average fps across all stored samples. */
  meanFps: number;
  /** Median (p50) of the per-sample p95 frame time (ms). */
  frameMsP95Median: number;
  /** 95th percentile of the per-sample p95 frame time (ms). */
  frameMsP95P95: number;
  /** Mean dropped-frame count per sample. */
  meanDroppedFrames: number;
}
