import { createServerFn } from "@tanstack/react-start";
import { adminAccessSchema } from "@/lib/feedback/types.ts";
import { z } from "zod";
import type { PerfSampleInput, TelemetryAggregates } from "./types.ts";

/**
 * TanStack Start server functions for opt-in anonymous telemetry (Req 12).
 *
 * Two surfaces, deliberately different trust levels:
 *
 * 1. SUBMIT — `submitTelemetrySampleFn`: NO AUTH by design. Telemetry samples
 *    are anonymous (Req 12.1, 12.3) — `PerfSampleInput` and the
 *    `telemetry_samples` table have no account id or email column, so there is
 *    nothing to authorize against and nothing to leak. The client only ever
 *    reaches this after checking the local opt-in flag (see ./opt-in.ts,
 *    Req 12.2); the server records whatever anonymous sample it is given.
 *
 * 2. AGGREGATE — `getTelemetryAggregatesFn`: ADMIN-GATED. Aggregate performance
 *    stats are an operator surface, so this is gated SERVER-SIDE by the SAME
 *    fail-closed, constant-time gate every other admin surface uses:
 *    `assertAdmin` from `@/lib/feedback/admin-auth.server.ts` (Reqs 4.1–4.6,
 *    12.4). A non-admin caller throws ForbiddenError, which is mapped to `null`
 *    so no aggregates are returned — mirroring `@/lib/admin/functions.ts`.
 *
 * The server-only data layer (`./server.ts`, which imports `getSql()`) is
 * imported DYNAMICALLY inside each handler so it never enters the client
 * bundle — matching `feedback/functions.ts` and `admin/functions.ts`.
 */

/**
 * Validates a submitted performance sample. Matches `PerfSampleInput` exactly:
 * the ONLY fields a sample ever carries (Req 12.3). There is deliberately no
 * account id / email field to validate — the shape has nowhere to put identity.
 * Numeric fields are constrained to finite, non-negative values so a malformed
 * or hostile submission cannot poison the aggregates; `deviceTier` is a bounded
 * non-identifying label string.
 */
const perfSampleSchema: z.ZodType<PerfSampleInput> = z.object({
  fpsAvg: z.number().finite().nonnegative(),
  frameMsP95: z.number().finite().nonnegative(),
  droppedFrames: z.number().finite().nonnegative(),
  particleBucket: z.number().finite().nonnegative(),
  deviceTier: z.string().max(64),
});

/**
 * Record one anonymous performance sample (Req 12.1). NO AUTH: samples are
 * anonymous by design (Req 12.3), so this is a public write with no token and
 * no user resolution. Validates the input against `perfSampleSchema` (the
 * `PerfSampleInput` shape) before touching the DB, then delegates to the
 * server-only `recordSample`. Returns a bare `{ ok: true }` — the caller learns
 * nothing beyond that the sample was accepted.
 */
export const submitTelemetrySampleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => perfSampleSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { recordSample } = await import("./server.ts");
    await recordSample(data);
    return { ok: true };
  });

/**
 * Aggregate performance statistics computed from stored samples (Req 12.4).
 * ADMIN-ONLY: `assertAdmin` runs FIRST, before any query; a non-admin caller
 * throws ForbiddenError, which is caught and mapped to `null` so no aggregates
 * leak (fail-closed, mirroring `getAnalyticsFn`). Only on a successful
 * authorization does it load and call the server-only `getTelemetryAggregates`.
 */
export const getTelemetryAggregatesFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminAccessSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<TelemetryAggregates | null> => {
    try {
      const { assertAdmin } = await import("@/lib/feedback/admin-auth.server.ts");
      await assertAdmin(data.token);
    } catch {
      return null;
    }
    const { getTelemetryAggregates } = await import("./server.ts");
    return getTelemetryAggregates();
  });
