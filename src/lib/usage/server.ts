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
  const generators = { ...current.generators };
  for (const [k, n] of Object.entries(delta.generators)) {
    generators[k] = (generators[k] ?? 0) + Math.max(0, n);
  }
  const next: UsageStats = {
    seconds: current.seconds + Math.max(0, Math.round(delta.seconds)),
    spawns: current.spawns + Math.max(0, Math.round(delta.spawns)),
    exports: current.exports + Math.max(0, Math.round(delta.exports)),
    peak: Math.max(current.peak, Math.max(0, Math.round(delta.peak))),
    generators,
  };
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
