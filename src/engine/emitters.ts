import { FLAG_CLOTH, FLAG_PINNED, type GeneratorKind, type Spring } from "./types.ts";
import type { ParticleSoA } from "./soa.ts";

export type SpawnResult = { spawned: number; springs: Spring[] };

export type SpawnOpts = {
  worldW: number;
  worldH: number;
  count: number;
  mass: number;
  lifespan: number;
  spread: number;
  speed: number;
  originX: number;
  originY: number;
  centralMass: number;
  textInput?: string;
};

function rand(): number {
  return Math.random();
}

function randRange(a: number, b: number): number {
  return a + (b - a) * rand();
}

function add(
  soa: ParticleSoA,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  mass: number,
  flags = 0,
  phase?: number,
): number {
  const i = soa.spawnSlot();
  if (i < 0) return -1;
  soa.writeParticle(i, x, y, vx, vy, life, mass, flags, phase);
  return i;
}

function bond(springs: Spring[], a: number, b: number, rest: number, k = 0.48): void {
  if (a < 0 || b < 0) return;
  springs.push({ a, b, rest, k });
}

export function spawnGenerator(kind: GeneratorKind, soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  switch (kind) {
    case "galaxy":
      return spawnGalaxy(soa, opts);
    case "ring":
      return spawnRing(soa, opts);
    case "burst":
      return spawnBurst(soa, opts);
    case "pour":
      return spawnPourBurst(soa, opts);
    case "fall":
      return spawnFallBurst(soa, opts);
    case "flock":
      return spawnFlock(soa, opts);
    case "cloth":
      return spawnCloth(soa, opts);
    case "nbody":
      return spawnNbody(soa, opts);
    case "text":
      return spawnText(soa, opts);
    case "fire":
      return spawnFire(soa, opts);
    case "smoke":
      return spawnSmoke(soa, opts);
    case "fireworks":
      return spawnFireworks(soa, opts);
    case "water":
      return spawnWater(soa, opts);
    case "tornado":
      return spawnTornado(soa, opts);
    case "lightning":
      return spawnLightning(soa, opts);
    case "blackhole":
      return spawnBlackhole(soa, opts);
    case "supernova":
      return spawnSupernova(soa, opts);
    case "fibonacci":
      return spawnFibonacci(soa, opts);
    case "sierpinski":
      return spawnSierpinski(soa, opts);
    case "crystal":
      return spawnCrystal(soa, opts);
    case "magma":
      return spawnMagma(soa, opts);
    case "aurora":
      return spawnAurora(soa, opts);
    case "helix":
      return spawnHelix(soa, opts);
    case "mandala":
      return spawnMandala(soa, opts);
    case "confetti":
      return spawnConfetti(soa, opts);
    case "molecule":
      return spawnMolecule(soa, opts);
    default:
      return spawnGalaxy(soa, opts);
  }
}

export function spawnGalaxy(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;
  const span = Math.min(worldW, worldH);
  const inner = span * 0.018;
  const outer = span * 0.46;
  const omega = Math.sqrt(Math.max(opts.centralMass, 0.2));
  const n = opts.count;
  const arms = 2;
  const turns = 1.15;
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const bulge = rand() < 0.07;
    let x: number;
    let y: number;
    let phase: number;
    if (bulge) {
      const r = inner * (0.2 + 0.9 * Math.pow(rand(), 0.6));
      const th = rand() * Math.PI * 2;
      x = cx + Math.cos(th) * r;
      y = cy + Math.sin(th) * r;
      phase = 0.08;
    } else {
      const arm = i % arms;
      const t = Math.pow(rand(), 0.5);
      const r = inner + (outer - inner) * t;
      const twist = t * turns * Math.PI * 2;
      const theta = twist + arm * Math.PI;
      const scatter = span * (0.0035 + 0.01 * t) * randRange(-1, 1);
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      x = cx + c * r - s * scatter;
      y = cy + s * r + c * scatter;
      phase = (((theta / (Math.PI * 2)) % 1) + 1) % 1;
    }
    const dx = x - cx;
    const dy = y - cy;
    const vx = -dy * omega;
    const vy = dx * omega;
    if (add(soa, x, y, vx, vy, -1, mass, 0, phase) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnRing(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;
  const R = Math.min(worldW, worldH) * 0.32;
  const width = R * 0.07;
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const t = (i + rand()) / opts.count;
    const theta = t * Math.PI * 2;
    const r = R + randRange(-width, width);
    const x = cx + Math.cos(theta) * r;
    const y = cy + Math.sin(theta) * r * 0.86;
    const orbital = Math.sqrt(Math.max(opts.centralMass, 0.2)) * r;
    const vx = -Math.sin(theta) * orbital;
    const vy = Math.cos(theta) * orbital * 0.86;
    if (add(soa, x, y, vx, vy, -1, mass) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnBurst(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const ox = opts.originX;
  const oy = opts.originY;
  const spread = opts.spread;
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const a = rand() * Math.PI * 2;
    const mag = opts.speed * (0.35 + rand() * 0.85) * (0.4 + spread);
    const vx = Math.cos(a) * mag;
    const vy = Math.sin(a) * mag;
    const life = opts.lifespan > 0 ? randRange(opts.lifespan * 0.5, opts.lifespan) : randRange(1.8, 3.6);
    if (add(soa, ox, oy, vx, vy, life, opts.mass * randRange(0.6, 1.4)) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnPourBurst(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const ox = opts.originX;
  const oy = Math.min(opts.originY, 0.12);
  let spawned = 0;
  const n = Math.min(opts.count, 400);
  for (let i = 0; i < n; i++) {
    const vx = randRange(-opts.spread * 0.4, opts.spread * 0.4);
    const vy = opts.speed * randRange(0.6, 1.1);
    if (add(soa, ox + randRange(-0.01, 0.01), oy, vx, vy, opts.lifespan || -1, opts.mass) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnFallBurst(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  let spawned = 0;
  const n = Math.min(opts.count, 800);
  for (let i = 0; i < n; i++) {
    const x = rand() * opts.worldW;
    const y = rand() * 0.08;
    const vx = randRange(-0.04, 0.04);
    const vy = opts.speed * randRange(0.15, 0.5);
    if (add(soa, x, y, vx, vy, opts.lifespan || -1, opts.mass * randRange(0.5, 1.2)) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnFlock(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  let spawned = 0;
  const n = opts.count;
  for (let i = 0; i < n; i++) {
    const x = rand() * opts.worldW;
    const y = rand() * opts.worldH;
    const a = rand() * Math.PI * 2;
    const s = opts.speed * randRange(0.4, 1);
    if (add(soa, x, y, Math.cos(a) * s, Math.sin(a) * s, -1, opts.mass) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnNbody(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const clumps = [
    { nx: 0.28, ny: 0.46, spread: 0.09, heavy: 3.4, share: 0.38 },
    { nx: 0.72, ny: 0.54, spread: 0.09, heavy: 3.0, share: 0.38 },
    { nx: 0.5, ny: 0.24, spread: 0.07, heavy: 2.2, share: 0.24 },
  ];
  const n = opts.count;
  let spawned = 0;
  const comX = worldW * 0.5;
  const comY = worldH * 0.48;
  for (let c = 0; c < clumps.length; c++) {
    const cl = clumps[c]!;
    const cx = cl.nx * worldW;
    const cy = cl.ny * worldH;
    const dx = cx - comX;
    const dy = cy - comY;
    const dist = Math.hypot(dx, dy) + 1e-6;
    const orbit = 0.42;
    const bulkVx = (-dy / dist) * orbit;
    const bulkVy = (dx / dist) * orbit;
    const nClump = Math.max(8, Math.round(n * cl.share));
    const span = Math.min(worldW, worldH);
    for (let i = 0; i < nClump && spawned < n; i++) {
      const u = rand();
      const v = rand();
      const r = Math.sqrt(u) * cl.spread * span;
      const th = v * Math.PI * 2;
      const x = cx + Math.cos(th) * r;
      const y = cy + Math.sin(th) * r;
      const heavy = i < 3;
      const m = mass * (heavy ? cl.heavy * randRange(1.6, 2.8) : randRange(0.45, 1.4));
      const vx = bulkVx + randRange(-0.04, 0.04);
      const vy = bulkVy + randRange(-0.04, 0.04);
      if (add(soa, x, y, vx, vy, -1, m, 0, heavy ? 0.95 : r / (cl.spread * span)) >= 0) spawned++;
      else return { spawned, springs: [] };
    }
  }
  return { spawned, springs: [] };
}

export function spawnCloth(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const cols = 36;
  const rows = 26;
  const spacing = Math.min(opts.worldW, opts.worldH) * 0.026;
  const startX = (opts.worldW - (cols - 1) * spacing) * 0.5;
  const startY = 0.06;
  const springs: Spring[] = [];
  const indices: number[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const pinned = y < 1 ? FLAG_PINNED | FLAG_CLOTH : FLAG_CLOTH;
      const i = add(soa, startX + x * spacing, startY + y * spacing, 0, 0, -1, opts.mass, pinned);
      if (i < 0) break;
      indices.push(i);
    }
  }
  const idx = (x: number, y: number) => indices[y * cols + x];
  const k = 0.55;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = idx(x, y);
      if (a === undefined || a < 0) continue;
      if (x + 1 < cols) {
        const b = idx(x + 1, y);
        if (b !== undefined && b >= 0) springs.push({ a, b, rest: spacing, k });
      }
      if (y + 1 < rows) {
        const b = idx(x, y + 1);
        if (b !== undefined && b >= 0) springs.push({ a, b, rest: spacing, k });
      }
      if (x + 1 < cols && y + 1 < rows) {
        const b = idx(x + 1, y + 1);
        if (b !== undefined && b >= 0) springs.push({ a, b, rest: spacing * Math.SQRT2, k: k * 0.55 });
      }
      if (x > 0 && y + 1 < rows) {
        const b = idx(x - 1, y + 1);
        if (b !== undefined && b >= 0) springs.push({ a, b, rest: spacing * Math.SQRT2, k: k * 0.55 });
      }
    }
  }
  return { spawned: indices.length, springs };
}

export function emitAlongStroke(
  soa: ParticleSoA,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spacing: number,
  speed: number,
  spread: number,
  life: number,
  mass: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(dist / Math.max(spacing, 0.002)));
  let spawned = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + dx * t + randRange(-spread * 0.15, spread * 0.15);
    const y = y0 + dy * t + randRange(-spread * 0.15, spread * 0.15);
    const a = rand() * Math.PI * 2;
    const mag = speed * randRange(0.1, 0.6);
    if (add(soa, x, y, Math.cos(a) * mag, Math.sin(a) * mag, life, mass) >= 0) spawned++;
    else break;
  }
  return spawned;
}

export function emitContinuous(
  soa: ParticleSoA,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  n: number,
  spread: number,
  speed: number,
  life: number,
  mass: number,
): number {
  let spawned = 0;
  const base = Math.atan2(dirY, dirX);
  for (let i = 0; i < n; i++) {
    const a = base + randRange(-spread, spread);
    const mag = speed * randRange(0.7, 1.2);
    if (
      add(
        soa,
        x + randRange(-0.006, 0.006),
        y + randRange(-0.004, 0.004),
        Math.cos(a) * mag,
        Math.sin(a) * mag,
        life,
        mass * randRange(0.7, 1.3),
      ) >= 0
    )
      spawned++;
    else break;
  }
  return spawned;
}

export function spawnText(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = new OffscreenCanvas(600, 300);
  } catch {
    if (typeof document !== "undefined") {
      canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 300;
    } else {
      return { spawned: 0, springs: [] };
    }
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) return { spawned: 0, springs: [] };

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, 600, 300);

  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 120px sans-serif";
  ctx.fillText((opts.textInput || "HELION").toUpperCase(), 300, 150);

  const imgData = ctx.getImageData(0, 0, 600, 300).data;

  let spawned = 0;
  const n = opts.count;

  const validPixels: { x: number; y: number }[] = [];
  for (let y = 0; y < 300; y += 2) {
    for (let x = 0; x < 600; x += 2) {
      const i = (y * 600 + x) * 4;
      if (imgData[i]! > 128) {
        validPixels.push({ x: (x - 300) / 300, y: (y - 150) / 150 });
      }
    }
  }

  if (validPixels.length === 0) return { spawned: 0, springs: [] };

  const scale = Math.min(worldW, worldH) * 0.45;

  for (let i = 0; i < n; i++) {
    const p = validPixels[Math.floor(rand() * validPixels.length)]!;
    const x = cx + p.x * scale + randRange(-0.002, 0.002);
    const y = cy + p.y * scale + randRange(-0.002, 0.002);
    if (add(soa, x, y, 0, 0, -1, mass * randRange(0.8, 1.2)) >= 0) {
      spawned++;
    } else {
      break;
    }
  }

  return { spawned, springs: [] };
}

export function spawnFire(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, mass } = opts;
  const cx = worldW * 0.5;
  let spawned = 0;
  const n = opts.count;
  for (let i = 0; i < n; i++) {
    const x = cx + randRange(-0.18, 0.18) * worldW;
    const y = 0.78 + rand() * 0.2;
    const vx = randRange(-0.12, 0.12);
    const vy = -opts.speed * randRange(0.45, 1.15);
    const life = opts.lifespan > 0 ? randRange(opts.lifespan * 0.45, opts.lifespan) : randRange(0.9, 2.1);
    const phase = Math.min(1, (0.92 - y) * 1.4 + rand() * 0.15);
    if (add(soa, x, y, vx, vy, life, mass * randRange(0.4, 1.1), 0, phase) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnSmoke(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, mass } = opts;
  const cx = worldW * 0.5;
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const x = cx + randRange(-0.1, 0.1) * worldW;
    const y = 0.72 + rand() * 0.22;
    const vx = randRange(-0.06, 0.06);
    const vy = -opts.speed * randRange(0.12, 0.4);
    const life = opts.lifespan > 0 ? randRange(opts.lifespan * 0.6, opts.lifespan) : randRange(2.8, 5.4);
    if (add(soa, x, y, vx, vy, life, mass * randRange(0.3, 0.8), 0, rand() * 0.4) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnFireworks(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const bursts = Math.max(4, Math.min(14, Math.round(opts.count / 350)));
  const per = Math.max(20, Math.floor(opts.count / bursts));
  let spawned = 0;
  for (let b = 0; b < bursts; b++) {
    const ox = randRange(0.12, 0.88) * opts.worldW;
    const oy = randRange(0.12, 0.55);
    const hue = rand();
    for (let i = 0; i < per; i++) {
      const a = rand() * Math.PI * 2;
      const mag = opts.speed * randRange(0.25, 1.15);
      const life = opts.lifespan > 0 ? randRange(opts.lifespan * 0.4, opts.lifespan) : randRange(1.4, 3.2);
      if (add(soa, ox, oy, Math.cos(a) * mag, Math.sin(a) * mag, life, opts.mass * randRange(0.5, 1.3), 0, hue) >= 0)
        spawned++;
      else return { spawned, springs: [] };
    }
  }
  return { spawned, springs: [] };
}

export function spawnWater(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  let spawned = 0;
  const n = opts.count;
  const pool = Math.floor(n * 0.78);
  const h = Math.max(0.007, Math.min(worldW, worldH) * 0.012);
  const x0 = worldW * 0.1;
  const x1 = worldW * 0.9;
  const y0 = worldH * 0.58;
  const y1 = worldH * 0.96;
  let row = 0;
  for (let y = y0; y <= y1 && spawned < pool; y += h * 0.866, row++) {
    const odd = row & 1;
    for (let x = x0 + (odd ? h * 0.5 : 0); x <= x1 && spawned < pool; x += h) {
      const jx = randRange(-h * 0.12, h * 0.12);
      const jy = randRange(-h * 0.12, h * 0.12);
      if (
        add(
          soa,
          x + jx,
          y + jy,
          randRange(-0.015, 0.015),
          randRange(-0.01, 0.02),
          -1,
          mass * randRange(0.9, 1.2),
          0,
          0.35,
        ) >= 0
      )
        spawned++;
      else return { spawned, springs: [] };
    }
  }
  const streamX = worldW * 0.5;
  for (let i = spawned; i < n; i++) {
    const x = streamX + randRange(-0.045, 0.045) * worldW;
    const y = randRange(0.02, 0.16) * worldH;
    if (add(soa, x, y, randRange(-0.03, 0.03), opts.speed * randRange(0.35, 0.9), -1, mass, 0, 0.7) >= 0)
      spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnTornado(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  let spawned = 0;
  const n = opts.count;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(n - 1, 1);
    const y = 0.08 + t * 0.86;
    const radius = (0.018 + t * 0.22) * Math.min(worldW, worldH);
    const theta = t * 14 + rand() * 0.4;
    const x = cx + Math.cos(theta) * radius + randRange(-0.008, 0.008);
    const yy = y * worldH + randRange(-0.01, 0.01);
    const omega = 2.4 - t * 1.1;
    const vx = -Math.sin(theta) * omega * radius;
    const vy = -0.18 * (1 - t) + randRange(-0.04, 0.02);
    const phase = (theta / (Math.PI * 2) + t) % 1;
    if (add(soa, x, yy, vx, vy, -1, mass * randRange(0.5, 1.2), 0, phase) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnLightning(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const points: { x: number; y: number; phase: number }[] = [];
  const bolt = (x: number, y: number, angle: number, segLen: number, depth: number) => {
    let px = x;
    let py = y;
    const segs = 7 + (3 - depth) * 3;
    for (let s = 0; s < segs; s++) {
      angle += randRange(-0.55, 0.55);
      px += Math.cos(angle) * segLen;
      py += Math.sin(angle) * segLen;
      if (py > 0.98 || px < 0.02 || px > opts.worldW - 0.02) break;
      points.push({ x: px, y: py, phase: 1 - depth * 0.22 });
      if (depth < 3 && rand() < 0.22) {
        bolt(px, py, angle + randRange(-0.9, 0.9), segLen * 0.62, depth + 1);
      }
    }
  };
  const seeds = Math.max(1, Math.min(4, Math.round(opts.count / 1800)));
  for (let i = 0; i < seeds; i++) {
    bolt(randRange(0.22, 0.78) * opts.worldW, 0.02, Math.PI * 0.5 + randRange(-0.15, 0.15), 0.045, 0);
  }
  if (points.length === 0) return { spawned: 0, springs: [] };
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const p = points[i % points.length]!;
    const j = Math.floor(rand() * points.length);
    const q = points[j]!;
    const mix = i < points.length ? p : q;
    const x = mix.x + randRange(-0.006, 0.006);
    const y = mix.y + randRange(-0.006, 0.006);
    const life = opts.lifespan > 0 ? randRange(opts.lifespan * 0.4, opts.lifespan) : randRange(0.28, 0.7);
    if (add(soa, x, y, randRange(-0.04, 0.04), randRange(-0.02, 0.12), life, opts.mass * 0.6, 0, mix.phase) >= 0)
      spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnBlackhole(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;
  const span = Math.min(worldW, worldH);
  let spawned = 0;
  const n = Math.min(opts.count, 3200);
  for (let i = 0; i < n; i++) {
    const inner = rand() < 0.08;
    const r = inner ? span * randRange(0.01, 0.05) : span * (0.06 + Math.pow(rand(), 0.45) * 0.38);
    const t = rand() * Math.PI * 2;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r * 0.62;
    const omega = Math.sqrt(Math.max(opts.centralMass, 1)) / Math.max(r, 0.02);
    const vx = -Math.sin(t) * omega * r * 0.55;
    const vy = Math.cos(t) * omega * r * 0.38;
    const phase = inner ? 0.95 : Math.min(1, r / (span * 0.4));
    if (add(soa, x, y, vx, vy, -1, mass * (inner ? 2.4 : randRange(0.5, 1.6)), 0, phase) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnSupernova(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const ox = opts.originX;
  const oy = opts.originY;
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const a = rand() * Math.PI * 2;
    const shell = rand() < 0.7;
    const mag = shell ? opts.speed * randRange(0.85, 1.35) : opts.speed * randRange(0.05, 0.45);
    const life = opts.lifespan > 0 ? randRange(opts.lifespan * 0.5, opts.lifespan) : randRange(2.2, 4.4);
    const phase = shell ? randRange(0.55, 1) : randRange(0, 0.35);
    if (
      add(
        soa,
        ox + randRange(-0.008, 0.008),
        oy + randRange(-0.008, 0.008),
        Math.cos(a) * mag,
        Math.sin(a) * mag,
        life,
        opts.mass * randRange(0.5, 1.6),
        0,
        phase,
      ) >= 0
    )
      spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnFibonacci(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;
  const outer = Math.min(worldW, worldH) * 0.44;
  const golden = Math.PI * (3 - Math.sqrt(5));
  let spawned = 0;
  const n = opts.count;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(n - 1, 1);
    const r = Math.sqrt(t) * outer;
    const theta = i * golden;
    const x = cx + Math.cos(theta) * r;
    const y = cy + Math.sin(theta) * r;
    const omega = 0.55;
    const vx = -Math.sin(theta) * omega * r * 0.15;
    const vy = Math.cos(theta) * omega * r * 0.15;
    if (add(soa, x, y, vx, vy, -1, mass, 0, (t + theta / (Math.PI * 2)) % 1) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnSierpinski(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const span = Math.min(worldW, worldH) * 0.42;
  const verts = [
    { x: cx, y: 0.12 },
    { x: cx - span, y: 0.12 + span * 1.62 },
    { x: cx + span, y: 0.12 + span * 1.62 },
  ];
  let px = cx;
  let py = 0.5;
  let spawned = 0;
  // Warm the chaos game so the first particles aren't a smear from the seed.
  for (let w = 0; w < 24; w++) {
    const v = verts[(Math.random() * 3) | 0]!;
    px = (px + v.x) * 0.5;
    py = (py + v.y) * 0.5;
  }
  for (let i = 0; i < opts.count; i++) {
    const v = verts[(Math.random() * 3) | 0]!;
    px = (px + v.x) * 0.5;
    py = (py + v.y) * 0.5;
    const phase = (i % 3) / 3;
    if (add(soa, px, py, 0, 0, -1, mass, 0, phase) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnCrystal(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const span = Math.min(worldW, worldH);
  const n = opts.count;
  let spawned = 0;

  const addHex = (cx: number, cy: number, R: number, rot: number, phase: number, filled: boolean) => {
    if (spawned >= n) return;
    const rings = filled ? Math.max(2, Math.round(R / (span * 0.012))) : 1;
    for (let q = -rings; q <= rings; q++) {
      for (let r = -rings; r <= rings; r++) {
        const s = -q - r;
        if (Math.abs(s) > rings) continue;
        const px = (3 / 2) * q;
        const py = Math.sqrt(3) * (r + q / 2);
        const dist = Math.hypot(px, py);
        const maxD = rings * 1.05 + 1e-6;
        if (!filled && dist < rings * 0.55) continue;
        const ang = rot;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const gx = (px * ca - py * sa) * (R / maxD);
        const gy = (px * sa + py * ca) * (R / maxD);
        if (add(soa, cx + gx, cy + gy, 0, 0, -1, mass * randRange(0.85, 1.2), 0, phase) >= 0) spawned++;
        else return;
        if (spawned >= n) return;
      }
    }
  };

  const addSnowflake = (cx: number, cy: number, R: number, rot: number, phase: number) => {
    const perArm = Math.max(10, Math.round((n * 0.08) / 6));
    for (let arm = 0; arm < 6; arm++) {
      const ang = rot + arm * (Math.PI / 3);
      for (let k = 0; k < perArm && spawned < n; k++) {
        const t = k / Math.max(perArm - 1, 1);
        const r = t * R;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (add(soa, x, y, 0, 0, -1, mass, 0, (phase + t * 0.2) % 1) >= 0) spawned++;
        else return;
        if (k > 2 && k % 2 === 0) {
          const br = R * 0.28 * (1 - t);
          for (const sign of [-1, 1]) {
            const bang = ang + sign * (Math.PI / 3);
            const steps = 3;
            for (let b = 1; b <= steps && spawned < n; b++) {
              const u = b / steps;
              if (
                add(
                  soa,
                  x + Math.cos(bang) * br * u,
                  y + Math.sin(bang) * br * u,
                  0,
                  0,
                  -1,
                  mass * 0.85,
                  0,
                  (phase + 0.15) % 1,
                ) >= 0
              )
                spawned++;
              else return;
            }
          }
        }
      }
    }
    addHex(cx, cy, R * 0.18, rot, phase, true);
  };

  const flakes = Math.max(5, Math.min(8, Math.round(n / 700)));
  const layout = [
    [0.22, 0.28],
    [0.5, 0.22],
    [0.78, 0.3],
    [0.28, 0.68],
    [0.72, 0.66],
    [0.5, 0.52],
    [0.18, 0.5],
    [0.84, 0.5],
  ];
  for (let f = 0; f < flakes; f++) {
    const [nx, ny] = layout[f % layout.length]!;
    const cx = nx * worldW + randRange(-0.02, 0.02) * worldW;
    const cy = ny * worldH + randRange(-0.02, 0.02) * worldH;
    const R = span * randRange(0.1, 0.16);
    addSnowflake(cx, cy, R, f * 0.35, (f % 6) / 6);
  }

  const shards = Math.max(4, Math.min(10, Math.round(n / 900)));
  for (let s = 0; s < shards && spawned < n; s++) {
    const cx = randRange(0.12, 0.88) * worldW;
    const cy = randRange(0.12, 0.88) * worldH;
    addHex(cx, cy, span * randRange(0.035, 0.06), rand() * Math.PI, (s % 5) / 5, true);
  }
  return { spawned, springs: [] };
}

export function spawnMagma(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const x = randRange(0.08, 0.92) * worldW;
    const y = randRange(0.62, 0.98) * worldH;
    const vx = randRange(-0.08, 0.08);
    const vy = -opts.speed * randRange(0.2, 1.1);
    if (add(soa, x, y, vx, vy, -1, mass * randRange(0.7, 1.4), 0, rand()) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnAurora(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const bands = 5;
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const band = i % bands;
    const t = i / bands / Math.max(opts.count / bands, 1);
    const x = worldW * (0.12 + band * 0.18 + Math.sin(t * 9) * 0.04) + randRange(-0.01, 0.01);
    const y = t * worldH * 0.92 + 0.04 + randRange(-0.012, 0.012);
    const vx = Math.sin(t * 6 + band) * 0.08;
    const vy = randRange(-0.04, 0.04);
    if (add(soa, x, y, vx, vy, -1, mass, 0, (band / bands + t) % 1) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnHelix(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const R = 0.2 * Math.min(worldW, worldH);
  const turns = 3.6;
  const n = opts.count;
  const springs: Spring[] = [];
  const strandA: number[] = [];
  const strandB: number[] = [];
  let spawned = 0;
  const strandBudget = Math.floor(n * 0.82);
  for (let i = 0; i < strandBudget; i++) {
    const strand = i & 1;
    const t = (i >> 1) / Math.max((strandBudget >> 1) - 1, 1);
    const theta = t * turns * Math.PI * 2 + strand * Math.PI;
    const x = cx + Math.cos(theta) * R;
    const y = (0.07 + t * 0.86) * worldH;
    const vx = -Math.sin(theta) * 0.035;
    const vy = 0.018;
    const idx = add(soa, x, y, vx, vy, -1, mass, 0, strand * 0.55 + t * 0.4);
    if (idx < 0) break;
    spawned++;
    if (strand === 0) strandA.push(idx);
    else strandB.push(idx);
  }
  const rungs = Math.min(22, Math.min(strandA.length, strandB.length));
  const step = Math.max(1, Math.floor(Math.min(strandA.length, strandB.length) / rungs));
  for (let r = 0; r < rungs; r++) {
    const ia = strandA[Math.min(strandA.length - 1, r * step)]!;
    const ib = strandB[Math.min(strandB.length - 1, r * step)]!;
    const x0 = soa.posX[ia]!;
    const y0 = soa.posY[ia]!;
    const x1 = soa.posX[ib]!;
    const y1 = soa.posY[ib]!;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const beads = 4;
    let prev = ia;
    for (let b = 1; b <= beads && spawned < n; b++) {
      const u = b / (beads + 1);
      const idx = add(
        soa,
        x0 + (x1 - x0) * u,
        y0 + (y1 - y0) * u,
        0,
        0.018,
        -1,
        mass * 0.55,
        0,
        0.28,
      );
      if (idx < 0) break;
      spawned++;
      bond(springs, prev, idx, dist / (beads + 1), 0.55);
      prev = idx;
    }
    bond(springs, prev, ib, dist / (beads + 1), 0.55);
  }
  return { spawned, springs };
}

export function spawnMandala(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;
  const outer = Math.min(worldW, worldH) * 0.42;
  const n = opts.count;
  let spawned = 0;
  const place = (r: number, theta: number, phase: number, m = mass) => {
    if (spawned >= n) return false;
    const x = cx + Math.cos(theta) * r;
    const y = cy + Math.sin(theta) * r;
    if (add(soa, x, y, 0, 0, -1, m, 0, phase) < 0) return false;
    spawned++;
    return true;
  };

  const petalN = Math.floor(n * 0.55);
  for (let i = 0; i < petalN && spawned < n; i++) {
    const theta = (i / petalN) * Math.PI * 2;
    const rose = Math.abs(Math.cos(4 * theta));
    const rMax = outer * (0.22 + 0.78 * Math.pow(rose, 0.55));
    const fill = 5 + ((i % 3) | 0);
    for (let s = 2; s <= fill && spawned < n; s++) {
      if (!place((rMax * s) / fill, theta, rose * 0.7 + 0.1)) return { spawned, springs: [] };
    }
  }

  for (let ring = 0; ring < 3 && spawned < n; ring++) {
    const r = outer * (0.18 + ring * 0.14);
    const count = 8 * (6 + ring * 4);
    for (let k = 0; k < count && spawned < n; k++) {
      const theta = (k / count) * Math.PI * 2 + ring * 0.08;
      if (!place(r, theta, 0.15 + ring * 0.12, mass * 0.9)) return { spawned, springs: [] };
    }
  }

  for (let star = 0; star < 8 && spawned < n; star++) {
    const a0 = star * (Math.PI / 4) - Math.PI / 2;
    const a1 = a0 + Math.PI / 8;
    const r0 = outer * 0.12;
    const r1 = outer * 0.95;
    const steps = 18;
    for (let s = 0; s <= steps && spawned < n; s++) {
      const u = s / steps;
      const theta = u < 0.5 ? a0 : a1;
      const r = u < 0.5 ? r0 + (r1 - r0) * (u * 2) : r1 + (r0 - r1) * ((u - 0.5) * 2);
      if (!place(r, theta, 0.85)) return { spawned, springs: [] };
    }
  }

  const hub = 8;
  for (let q = -hub; q <= hub && spawned < n; q++) {
    for (let r = -hub; r <= hub && spawned < n; r++) {
      if (Math.abs(q) + Math.abs(r) > hub) continue;
      const x = cx + q * outer * 0.018;
      const y = cy + r * outer * 0.018;
      if (add(soa, x, y, 0, 0, -1, mass * 1.1, 0, 0.05) < 0) return { spawned, springs: [] };
      spawned++;
    }
  }
  return { spawned, springs: [] };
}

export function spawnConfetti(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const life = opts.lifespan > 0 ? opts.lifespan : 3.2;
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const x = randRange(0.15, 0.85) * worldW;
    const y = randRange(0.05, 0.35) * worldH;
    const vx = randRange(-0.7, 0.7);
    const vy = randRange(-0.15, 0.85);
    if (add(soa, x, y, vx, vy, randRange(life * 0.4, life), mass * randRange(0.5, 1.2), 0, rand()) >= 0)
      spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

/** Discrete ball-and-stick molecules — not a self-gravitating lattice. */
export function spawnMolecule(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const n = opts.count;
  const springs: Spring[] = [];
  let spawned = 0;
  const span = Math.min(worldW, worldH);

  const atom = (x: number, y: number, m: number, species: number) => {
    if (spawned >= n) return -1;
    const i = add(soa, x, y, randRange(-0.01, 0.01), randRange(-0.01, 0.01), -1, m, 0, species);
    if (i >= 0) spawned++;
    return i;
  };

  const benzene = (cx: number, cy: number, s: number) => {
    const ids: number[] = [];
    for (let k = 0; k < 6; k++) {
      const th = (k / 6) * Math.PI * 2 - Math.PI / 2;
      ids.push(atom(cx + Math.cos(th) * s, cy + Math.sin(th) * s, mass * 1.6, 0.15));
    }
    for (let k = 0; k < 6; k++) {
      bond(springs, ids[k]!, ids[(k + 1) % 6]!, s, 0.62);
      const th = (k / 6) * Math.PI * 2 - Math.PI / 2;
      const h = atom(cx + Math.cos(th) * s * 1.55, cy + Math.sin(th) * s * 1.55, mass * 0.45, 0.8);
      bond(springs, ids[k]!, h, s * 0.55, 0.5);
    }
  };

  const water = (cx: number, cy: number, s: number) => {
    const o = atom(cx, cy, mass * 1.8, 0.05);
    const a = (104.5 * Math.PI) / 180 / 2;
    const h1 = atom(cx + Math.cos(Math.PI - a) * s, cy + Math.sin(Math.PI - a) * s, mass * 0.4, 0.85);
    const h2 = atom(cx + Math.cos(a) * s, cy + Math.sin(a) * s, mass * 0.4, 0.85);
    bond(springs, o, h1, s, 0.7);
    bond(springs, o, h2, s, 0.7);
  };

  const chain = (x0: number, y0: number, len: number, s: number, ang: number) => {
    let prev = -1;
    for (let i = 0; i < len; i++) {
      const x = x0 + Math.cos(ang) * s * i + ((i & 1) ? Math.cos(ang + Math.PI / 2) * s * 0.35 : 0);
      const y = y0 + Math.sin(ang) * s * i + ((i & 1) ? Math.sin(ang + Math.PI / 2) * s * 0.35 : 0);
      const id = atom(x, y, mass * (i % 3 === 0 ? 1.5 : 1), (i % 5) / 5);
      if (prev >= 0) bond(springs, prev, id, s * 1.05, 0.55);
      prev = id;
    }
  };

  const sites = [
    { x: 0.22, y: 0.32, kind: "benzene" as const },
    { x: 0.5, y: 0.28, kind: "benzene" as const },
    { x: 0.78, y: 0.34, kind: "benzene" as const },
    { x: 0.3, y: 0.68, kind: "benzene" as const },
    { x: 0.7, y: 0.7, kind: "benzene" as const },
    { x: 0.5, y: 0.55, kind: "chain" as const },
    { x: 0.18, y: 0.52, kind: "water" as const },
    { x: 0.86, y: 0.55, kind: "water" as const },
    { x: 0.42, y: 0.82, kind: "water" as const },
    { x: 0.62, y: 0.18, kind: "water" as const },
  ];
  const sBen = span * 0.055;
  const sWat = span * 0.04;
  for (const site of sites) {
    if (spawned >= n) break;
    const x = site.x * worldW;
    const y = site.y * worldH;
    if (site.kind === "benzene") benzene(x, y, sBen);
    else if (site.kind === "water") water(x, y, sWat);
    else chain(x - span * 0.16, y, 9, span * 0.032, 0.15);
  }

  // Tile extra discrete rings with gaps — never a packed lattice or a disk.
  let guard = 0;
  while (spawned < n && guard < n + 8) {
    guard++;
    const x = randRange(0.1, 0.9) * worldW;
    const y = randRange(0.1, 0.9) * worldH;
    if (rand() < 0.55) benzene(x, y, sBen * randRange(0.7, 1.05));
    else water(x, y, sWat * randRange(0.8, 1.2));
    if (springs.length > 2400) break;
  }
  return { spawned, springs };
}



