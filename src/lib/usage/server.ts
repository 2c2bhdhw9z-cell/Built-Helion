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

/**
 * Merge a usage delta into an account's totals (Req 3.2, 3.3).
 *
 * `activitySeq` is the client's monotonic cumulative-activity counter at flush
 * time. The server keeps a per-account `last_activity_seq` high-water mark and
 * applies the delta ONLY when `activitySeq` exceeds it, then advances the mark —
 * so a replayed or stale flush (equal-or-lower seq) is a no-op at the data layer
 * (at-most-once per distinct local activity increment).
 *
 * Backward compatibility: callers that omit `activitySeq` get the previous
 * always-apply behavior. We read the stored `last_activity_seq` and pass
 * `stored + 1` as the incoming seq, which is always strictly greater, so the
 * delta applies and the mark simply advances by one. Existing callers therefore
 * behave exactly as before while a seq-aware caller (wired in a later task) gets
 * the idempotent guard.
 */
export async function mergeAccountUsage(
  userId: string,
  delta: UsageStats,
  activitySeq?: number,
): Promise<UsageStats> {
  const sql = await getSql();
  const rows = await sql<{
    seconds: unknown;
    spawns: unknown;
    exports: unknown;
    peak: unknown;
    generators: unknown;
    last_activity_seq: unknown;
  }>`
    select seconds, spawns, exports, peak, generators, last_activity_seq
    from usage_stats
    where user_id = ${userId}
  `;
  const row = rows[0];
  const current: UsageStats = row
    ? {
        seconds: asInt(row.seconds),
        spawns: asInt(row.spawns),
        exports: asInt(row.exports),
        peak: asInt(row.peak),
        generators: asGenerators(row.generators),
      }
    : emptyUsage();
  const storedSeq = asInt(row?.last_activity_seq);
  // When no seq is supplied, use `storedSeq + 1` so the delta always applies
  // (preserving the legacy behavior) while still advancing the stored mark.
  const incomingSeq = activitySeq === undefined ? storedSeq + 1 : activitySeq;

  const { next, applied, seq } = mergeUsageMath(current, delta, storedSeq, incomingSeq);

  // A replayed/stale flush (`!applied`) leaves totals and the high-water mark
  // untouched — nothing to persist, so return the unchanged current totals.
  if (!applied) return next;

  await sql`
    insert into usage_stats (user_id, seconds, spawns, exports, peak, generators, last_activity_seq, updated_at)
    values (
      ${userId},
      ${next.seconds},
      ${next.spawns},
      ${next.exports},
      ${next.peak},
      ${JSON.stringify(next.generators)},
      ${seq},
      now()
    )
    on conflict (user_id) do update set
      seconds = excluded.seconds,
      spawns = excluded.spawns,
      exports = excluded.exports,
      peak = excluded.peak,
      generators = excluded.generators,
      last_activity_seq = excluded.last_activity_seq,
      updated_at = now()
  `;
  return next;
}
