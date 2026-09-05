import { getSql } from "@/lib/db";
import { percentile, summarize } from "@/lib/perf/stats";
import type { PerfSample } from "@/lib/perf/ring-buffer";
import type { PerfSampleInput, TelemetryAggregates } from "./types.ts";

/**
 * Server-only data layer for opt-in anonymous telemetry (Telemetry_Service).
 * Imports getSql() (which throws in the browser), so this module must NEVER be
 * imported by client code — the server function/REST route (task 11.3) imports
 * it dynamically inside its handler.
 *
 * PRIVACY BY DESIGN (Req 12.3, Property 12): the `telemetry_samples` table has
 * NO user/email column and `PerfSampleInput` has no identity field, so a sample
 * can never carry an account id or email. The generated `id` below is a random
 * row key — it is NOT derived from and cannot be linked to any user.
 *
 * No mock/seeded data: every row here comes from a real anonymous submission.
 */

/** The raw stored telemetry row shape (snake_case, matches the columns). */
type RawTelemetryRow = {
  fps_avg: number;
  frame_ms_p95: number;
  dropped_frames: number;
  particle_bucket: number;
  device_tier: string;
};

/**
 * Record one anonymous performance sample (Req 12.1). Inserts ONLY the
 * non-identifying performance fields into `telemetry_samples`; a random row id
 * is generated app-side. Never stores a user id or email — there is no column
 * or input field for one (Req 12.3).
 */
export async function recordSample(sample: PerfSampleInput): Promise<void> {
  const sql = await getSql();
  const id = crypto.randomUUID();
  await sql`
    insert into telemetry_samples (
      id, fps_avg, frame_ms_p95, dropped_frames, particle_bucket, device_tier
    ) values (
      ${id},
      ${sample.fpsAvg},
      ${sample.frameMsP95},
      ${sample.droppedFrames},
      ${sample.particleBucket},
      ${sample.deviceTier}
    )
  `;
}

const EMPTY_AGGREGATES: TelemetryAggregates = {
  sampleCount: 0,
  meanFps: 0,
  frameMsP95Median: 0,
  frameMsP95P95: 0,
  meanDroppedFrames: 0,
};

/**
 * Aggregate performance statistics computed from every stored sample (Req
 * 12.4). Returns an all-zero summary when no samples exist (never NaN).
 *
 * Reuses `src/lib/perf/stats.ts` for the math: each stored row is mapped to a
 * `PerfSample`-shaped record (fps = fpsAvg, frameMs = frameMsP95) and fed to
 * `summarize`, whose `fpsAvg` is the mean fps across samples; `percentile` then
 * derives the p50/p95 distribution of the per-sample p95 frame times.
 *
 * This is the data-layer function only — the admin gating (`assertAdmin`) is
 * applied by the server function in task 11.3, not here.
 */
export async function getTelemetryAggregates(): Promise<TelemetryAggregates> {
  const sql = await getSql();
  const rows = await sql<RawTelemetryRow>`
    select fps_avg, frame_ms_p95, dropped_frames, particle_bucket, device_tier
    from telemetry_samples
  `;
  if (rows.length === 0) return { ...EMPTY_AGGREGATES };

  // Map each stored sample into the PerfSample shape summarize() consumes. Only
  // the fields the aggregate math reads (fps, frameMs) carry meaningful values;
  // the rest are zero-filled to satisfy the record type.
  const samples: PerfSample[] = rows.map((r) => ({
    t: 0,
    fps: r.fps_avg,
    frameMs: r.frame_ms_p95,
    computeMs: 0,
    renderMs: 0,
    other: 0,
    live: 0,
    sleeping: 0,
    cap: 0,
    ramBytes: 0,
    drawCalls: 0,
    drawnPoints: 0,
    nanCount: 0,
    oobCount: 0,
  }));

  const summary = summarize(samples);
  const frameP95Values = rows.map((r) => r.frame_ms_p95);
  const droppedTotal = rows.reduce((acc, r) => acc + r.dropped_frames, 0);

  return {
    sampleCount: rows.length,
    meanFps: summary.fpsAvg,
    frameMsP95Median: percentile(frameP95Values, 50),
    frameMsP95P95: percentile(frameP95Values, 95),
    meanDroppedFrames: droppedTotal / rows.length,
  };
}
