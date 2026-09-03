/** Usage counters. This-device via platform KV. Account totals live in the DB when signed in. Never seeded. */

import { kv } from "../platform/storage.ts";

export type UsageStats = {
  seconds: number;
  spawns: number;
  exports: number;
  peak: number;
  generators: Record<string, number>;
};

const KEY = "helion.usage";
const FLUSH_KEY = "helion.usage.flushed";

export function emptyUsage(): UsageStats {
  return { seconds: 0, spawns: 0, exports: 0, peak: 0, generators: {} };
}

export function readUsage(): UsageStats {
  try {
    const raw = kv().get(KEY);
    if (!raw) return emptyUsage();
    const parsed = JSON.parse(raw) as Partial<UsageStats>;
    return {
      seconds: Number.isFinite(parsed.seconds) ? Math.max(0, parsed.seconds!) : 0,
      spawns: Number.isFinite(parsed.spawns) ? Math.max(0, parsed.spawns!) : 0,
      exports: Number.isFinite(parsed.exports) ? Math.max(0, parsed.exports!) : 0,
      peak: Number.isFinite(parsed.peak) ? Math.max(0, parsed.peak!) : 0,
      generators: parsed.generators && typeof parsed.generators === "object" ? parsed.generators : {},
    };
  } catch {
    return emptyUsage();
  }
}

function write(u: UsageStats): void {
  try {
    kv().set(KEY, JSON.stringify(u));
  } catch {
    /* quota */
  }
}

export function noteSpawn(kind: string): UsageStats {
  const u = readUsage();
  u.spawns += 1;
  u.generators[kind] = (u.generators[kind] ?? 0) + 1;
  write(u);
  return u;
}

export function noteExport(): UsageStats {
  const u = readUsage();
  u.exports += 1;
  write(u);
  return u;
}

export function notePeak(n: number): UsageStats {
  const u = readUsage();
  if (n > u.peak) {
    u.peak = n;
    write(u);
  }
  return u;
}

export function addSeconds(n: number): UsageStats {
  const u = readUsage();
  u.seconds += Math.max(0, Math.round(n));
  write(u);
  return u;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Last device snapshot already sent to the account. First takeDelta() is a no-op so old local time is not double-counted. */

function readFlushed(): UsageStats | null {
  try {
    const raw = kv().get(FLUSH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UsageStats>;
    return {
      seconds: Number.isFinite(parsed.seconds) ? Math.max(0, parsed.seconds!) : 0,
      spawns: Number.isFinite(parsed.spawns) ? Math.max(0, parsed.spawns!) : 0,
      exports: Number.isFinite(parsed.exports) ? Math.max(0, parsed.exports!) : 0,
      peak: Number.isFinite(parsed.peak) ? Math.max(0, parsed.peak!) : 0,
      generators: parsed.generators && typeof parsed.generators === "object" ? parsed.generators : {},
    };
  } catch {
    return null;
  }
}

export function takeDelta(): UsageStats {
  const u = readUsage();
  const flushed = readFlushed();
  if (!flushed) {
    kv().set(FLUSH_KEY, JSON.stringify(u));
    return emptyUsage();
  }
  const d: UsageStats = {
    seconds: Math.max(0, u.seconds - flushed.seconds),
    spawns: Math.max(0, u.spawns - flushed.spawns),
    exports: Math.max(0, u.exports - flushed.exports),
    peak: u.peak,
    generators: {},
  };
  for (const [k, v] of Object.entries(u.generators)) {
    const n = v - (flushed.generators[k] ?? 0);
    if (n > 0) d.generators[k] = n;
  }
  kv().set(FLUSH_KEY, JSON.stringify(u));
  return d;
}

export function hasDelta(d: UsageStats): boolean {
  return d.seconds > 0 || d.spawns > 0 || d.exports > 0 || d.peak > 0 || Object.keys(d.generators).length > 0;
}
