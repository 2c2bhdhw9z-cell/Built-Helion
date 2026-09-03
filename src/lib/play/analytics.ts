/** Local usage counters. Not a cloud analytics pipeline. */

export type UsageStats = {
  seconds: number;
  spawns: number;
  exports: number;
  peak: number;
  generators: Record<string, number>;
};

const KEY = "helion.usage";

export function emptyUsage(): UsageStats {
  return { seconds: 0, spawns: 0, exports: 0, peak: 0, generators: {} };
}

export function readUsage(): UsageStats {
  try {
    if (typeof localStorage === "undefined") return emptyUsage();
    const raw = localStorage.getItem(KEY);
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
    localStorage.setItem(KEY, JSON.stringify(u));
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
