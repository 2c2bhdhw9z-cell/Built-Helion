import { getSql } from "@/lib/db";
import { emptyUsage, type UsageStats } from "@/lib/play/analytics";

function asInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function asGenerators(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const c = asInt(n);
    if (c > 0 && k) out[k.slice(0, 40)] = c;
  }
  return out;
}

export type MergeUsageResult = {
  /** The account totals after (conditionally) applying the delta. */
  next: UsageStats;
  /** True when the delta was applied (i.e. `activitySeq > storedSeq`). */
  applied: boolean;
  /** The activity sequence that should now be persisted for the account. */
  seq: number;
};

/**
 * Pure usage-merge arithmetic (no I/O) — property-testable.
 *
 * Applies `delta` to `current` totals ONLY when `activitySeq > storedSeq`
 * (the idempotent flush guard, Req 3.3): a replayed or stale flush whose
 * `activitySeq` is equal to or lower than the stored value never changes the
 * totals. When applied, counters accumulate (monotonic, non-negative) and
 * `peak` becomes the max of the current and delta peaks (Req 3.2).
 *
 * The returned `seq` is the value the caller should persist: it advances to
 * `activitySeq` when the delta applies, and otherwise stays at `storedSeq`.
 */
export function mergeUsageMath(
  current: UsageStats,
  delta: UsageStats,
  storedSeq: number,
  activitySeq: number,
): MergeUsageResult {
  const stored = asInt(storedSeq);
  const incoming = asInt(activitySeq);
  const applied = incoming > stored;
  if (!applied) {
    return {
      next: {
        seconds: asInt(current.seconds),
        spawns: asInt(current.spawns),
        exports: asInt(current.exports),
        peak: asInt(current.peak),
        generators: asGenerators(current.generators),
      },
      applied: false,
      seq: stored,
    };
  }
  const generators = asGenerators(current.generators);
  for (const [k, n] of Object.entries(delta.generators ?? {})) {
    const c = asInt(n);
    if (c > 0 && k) {
      const key = k.slice(0, 40);
      generators[key] = (generators[key] ?? 0) + c;
    }
  }
  const next: UsageStats = {
    seconds: asInt(current.seconds) + asInt(delta.seconds),
    spawns: asInt(current.spawns) + asInt(delta.spawns),
    exports: asInt(current.exports) + asInt(delta.exports),
    peak: Math.max(asInt(current.peak), asInt(delta.peak)),
    generators,
  };
  return { next, applied: true, seq: incoming };
}

export async function readAccountUsage(userId: string): Promise<UsageStats> {
  const sql = await getSql();
  const rows = await sql<{
    seconds: unknown;
    spawns: unknown;
    exports: unknown;
    peak: unknown;
    generators: unknown;
  }>`
    select seconds, spawns, exports, peak, generators
    from usage_stats
    where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return emptyUsage();
  return {
    seconds: asInt(row.seconds),
    spawns: asInt(row.spawns),
    exports: asInt(row.exports),
    peak: asInt(row.peak),
    generators: asGenerators(row.generators),
  };
}

export async function mergeAccountUsage(userId: string, delta: UsageStats): Promise<UsageStats> {
  const current = await readAccountUsage(userId);
  // Delegate the arithmetic to the pure helper. Passing storedSeq=0/activitySeq=1
  // always applies the delta, preserving the existing (non-idempotent) behavior;
  // the seq-guarded flush is wired in a later task.
  const { next } = mergeUsageMath(current, delta, 0, 1);
  const sql = await getSql();
  await sql`
    insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, updated_at)
    values (
      ${userId},
      ${next.seconds},
      ${next.spawns},
      ${next.exports},
      ${next.peak},
      ${JSON.stringify(next.generators)},
      now()
    )
    on conflict (user_id) do update set
      seconds = excluded.seconds,
      spawns = excluded.spawns,
      exports = excluded.exports,
      peak = excluded.peak,
      generators = excluded.generators,
      updated_at = now()
  `;
  return next;
}
