import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fc from "fast-check";
import type { PerfSampleInput } from "./types.ts";

// server.ts imports `@/lib/db` (getSql) for the DB-backed `recordSample`. This
// suite is a REAL PGLite round-trip: it inserts genuine anonymous samples and
// reads the stored rows back — no DB mocking, no seeded fixtures beyond the
// rows this test inserts itself. The PGLite glob loader hook inlines the real
// migrations/*.sql (INCLUDING 0009_completion.sql's `telemetry_samples` table)
// so the genuine schema is applied.
//
// The `@/` alias in server.ts only resolves once the loader hook below is
// registered, and a static top-level `import` would be hoisted and resolved
// BEFORE register() runs. So — exactly like the sibling suites (creations.test,
// admin.integration.test, leaderboard.test) — we register the loader here and
// import server.ts / db.ts dynamically inside a before() hook, after the loader
// is active.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type TelemetryServer = { recordSample: (sample: PerfSampleInput) => Promise<void> };
type Db = { getSql: () => Promise<import("../db.ts").Sql> };

let recordSample: TelemetryServer["recordSample"];
let getSql: Db["getSql"];

before(async () => {
  ({ recordSample } = (await import("./server.ts")) as unknown as TelemetryServer);
  ({ getSql } = (await import("../db.ts")) as unknown as Db);
});

// The complete, EXACT set of columns the `telemetry_samples` table is allowed
// to have (migration 0009_completion.sql). Crucially there is NO `user_id`, no
// `email`, and no `account` column — identity has nowhere to live.
const ALLOWED_COLUMNS = [
  "id",
  "fps_avg",
  "frame_ms_p95",
  "dropped_frames",
  "particle_bucket",
  "device_tier",
  "created_at",
] as const;

// Columns that would betray Property 12 if they ever appeared on a stored row.
const FORBIDDEN_COLUMN_FRAGMENTS = ["user", "email", "account", "session", "name"];

// A generator for arbitrary PerfSampleInput values across the realistic
// performance-metric input space. The fps/frame fields are stored in `real`
// (32-bit float) columns, so we generate 32-bit-representable magnitudes: 0.0
// plus values in [1e-3, ...], avoiding subnormal doubles like 5e-324 that
// Postgres rejects as "out of range for type real" (a storage-type boundary,
// not a behavior under test here). `deviceTier` covers empty + arbitrary
// non-identifying label strings; the counters cover zero and large counts.
function nonNegativeRealArb(max: number): fc.Arbitrary<number> {
  return fc.oneof(
    fc.constant(0),
    fc.double({ min: 1e-3, max, noNaN: true, noDefaultInfinity: true }),
  );
}

function perfSampleArb(): fc.Arbitrary<PerfSampleInput> {
  return fc.record({
    fpsAvg: nonNegativeRealArb(1000),
    frameMsP95: nonNegativeRealArb(10_000),
    droppedFrames: fc.integer({ min: 0, max: 100_000 }),
    particleBucket: fc.integer({ min: 0, max: 1_000_000 }),
    deviceTier: fc.string({ maxLength: 24 }),
  });
}

// PGLite stores `real` columns as 32-bit floats, so a generated double is not
// bit-identical on read-back. Compare fps/frame within single-precision epsilon;
// integers and the tier string must match exactly.
function realsClose(stored: number, input: number): boolean {
  const scale = Math.max(1, Math.abs(input));
  return Math.abs(stored - input) <= scale * 1e-5;
}

describe("recordSample — Property 12: telemetry samples never carry identity", () => {
  // Feature: helion-completion, Property 12: Telemetry samples never carry
  // identity — for any recorded telemetry sample, the stored row contains ONLY
  // the non-identifying performance fields { id, fps_avg, frame_ms_p95,
  // dropped_frames, particle_bucket, device_tier, created_at } and NO account
  // id or email field. Verified against REAL embedded PGLite via the loader:
  // generate arbitrary PerfSampleInput, recordSample(sample), then read the
  // inserted row back with getSql and assert its column set is exactly the
  // allowed set (no user_id / email / account column exists) and the stored
  // values match the input.
  // Validates: Requirements 12.3
  it("stores only the performance columns — no user/email/account column exists (>=100 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(perfSampleArb(), async (sample) => {
        const sql = await getSql();

        // Count rows before the insert so we can identify the single row this
        // iteration adds without depending on a shared clean table.
        const [{ n: before }] = await sql<{ n: number }>`
          select count(*)::int as n from telemetry_samples
        `;

        await recordSample(sample);

        const [{ n: after }] = await sql<{ n: number }>`
          select count(*)::int as n from telemetry_samples
        `;
        // Exactly one anonymous row was recorded.
        assert.equal(after - before, 1, "recordSample inserts exactly one row");

        // Read back the most-recently inserted row (the one this iteration
        // added). `select *` returns every column that physically exists on the
        // table — the only reliable way to prove no identity column is present.
        const rows = await sql<Record<string, unknown>>`
          select * from telemetry_samples
          order by created_at desc, id desc
          limit 1
        `;
        assert.equal(rows.length, 1, "the inserted row is readable back");
        const row = rows[0];
        const keys = Object.keys(row);

        // 1. The stored row's columns are EXACTLY the allowed non-identifying
        //    set — nothing more, nothing less.
        assert.deepEqual(
          [...keys].sort(),
          [...ALLOWED_COLUMNS].sort(),
          `stored row columns must be exactly ${ALLOWED_COLUMNS.join(", ")} — got ${keys.join(", ")}`,
        );

        // 2. Explicitly: no key even resembles an identity/PII field.
        for (const key of keys) {
          const lower = key.toLowerCase();
          for (const fragment of FORBIDDEN_COLUMN_FRAGMENTS) {
            assert.ok(
              !lower.includes(fragment),
              `telemetry row must carry no identity column, found "${key}"`,
            );
          }
        }

        // 3. The stored values match the generated input (proving the row we
        //    inspected is genuinely the sample we recorded, and that only the
        //    performance fields were persisted).
        assert.ok(
          realsClose(row.fps_avg as number, sample.fpsAvg),
          `fps_avg ${String(row.fps_avg)} != input ${sample.fpsAvg}`,
        );
        assert.ok(
          realsClose(row.frame_ms_p95 as number, sample.frameMsP95),
          `frame_ms_p95 ${String(row.frame_ms_p95)} != input ${sample.frameMsP95}`,
        );
        assert.equal(row.dropped_frames, sample.droppedFrames, "dropped_frames matches input");
        assert.equal(row.particle_bucket, sample.particleBucket, "particle_bucket matches input");
        assert.equal(row.device_tier, sample.deviceTier, "device_tier matches input");
        // The id is an app-generated random key, never derived from identity.
        assert.equal(typeof row.id, "string", "id is a string row key");
        assert.ok((row.id as string).length > 0, "id is non-empty");
      }),
      { numRuns: 100 },
    );
  });

  it("the telemetry_samples table itself declares no user/email column (schema-level check)", async () => {
    // A single authoritative check against the catalog: even independent of any
    // inserted row, the table's DECLARED columns must exclude every identity
    // field. This guards against a future migration silently adding one.
    const sql = await getSql();
    const cols = await sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_name = 'telemetry_samples'
    `;
    const names = cols.map((c) => c.column_name.toLowerCase());
    assert.deepEqual(
      [...names].sort(),
      [...ALLOWED_COLUMNS].sort(),
      `telemetry_samples must declare exactly the allowed columns — got ${names.join(", ")}`,
    );
    for (const name of names) {
      for (const fragment of FORBIDDEN_COLUMN_FRAGMENTS) {
        assert.ok(
          !name.includes(fragment),
          `telemetry_samples must declare no identity column, found "${name}"`,
        );
      }
    }
  });
});
