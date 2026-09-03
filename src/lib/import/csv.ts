/** Parse a particle CSV: header optional. Columns x,y[,vx,vy,mass,life,phase]. */

export type CsvParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  life: number;
  phase: number;
};

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function parseParticleCsv(text: string): CsvParticle[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return [];
  let start = 0;
  const first = lines[0]!.toLowerCase();
  if (first.includes("x") && first.includes("y") && /[a-z]/.test(first)) start = 1;
  const out: CsvParticle[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i]!.split(/[,\t;]/).map((p) => p.trim());
    const x = num(parts[0], NaN);
    const y = num(parts[1], NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({
      x,
      y,
      vx: num(parts[2], 0),
      vy: num(parts[3], 0),
      mass: Math.max(0.05, num(parts[4], 1)),
      life: num(parts[5], -1),
      phase: Math.min(1, Math.max(0, num(parts[6], (out.length % 7) / 7))),
    });
    if (out.length >= 1_000_000) break;
  }
  return out;
}
