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
  const cx = opts.worldW * 0.5;
  const cy = opts.worldH * 0.5;
  let spawned = 0;
  const n = Math.min(opts.count, 2400);
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rand()) * Math.min(opts.worldW, opts.worldH) * 0.38;
    const t = rand() * Math.PI * 2;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r * 0.85;
    if (
      add(soa, x, y, randRange(-0.05, 0.05), randRange(-0.05, 0.05), -1, opts.mass * randRange(0.4, 2.2)) >= 0
    )
      spawned++;
    else break;
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
  const pool = Math.floor(n * 0.62);
  for (let i = 0; i < pool; i++) {
    const x = randRange(0.08, 0.92) * worldW;
    const y = randRange(0.62, 0.96) * worldH;
    if (add(soa, x, y, randRange(-0.04, 0.04), randRange(-0.02, 0.08), -1, mass * randRange(0.8, 1.4)) >= 0)
      spawned++;
    else break;
  }
  for (let i = pool; i < n; i++) {
    const x = worldW * 0.5 + randRange(-0.08, 0.08);
    const y = randRange(0.02, 0.14);
    if (add(soa, x, y, randRange(-0.05, 0.05), opts.speed * randRange(0.3, 0.8), -1, mass) >= 0) spawned++;
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
  const cols = Math.max(8, Math.round(Math.sqrt(opts.count * (worldW / worldH))));
  const rows = Math.max(8, Math.round(opts.count / cols));
  let spawned = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ox = ((y & 1) * 0.5) / cols;
      const px = ((x + 0.5) / cols + ox) * worldW * 0.72 + worldW * 0.14;
      const py = ((y + 0.5) / rows) * worldH * 0.72 + worldH * 0.14;
      const jx = randRange(-0.004, 0.004);
      const jy = randRange(-0.004, 0.004);
      if (add(soa, px + jx, py + jy, 0, 0, -1, mass, 0, ((x + y) % 7) / 7) >= 0) spawned++;
      else return { spawned, springs: [] };
    }
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
  let spawned = 0;
  for (let i = 0; i < opts.count; i++) {
    const t = i / Math.max(opts.count - 1, 1);
    const y = 0.06 + t * 0.88;
    const theta = t * 18;
    const r = 0.16 * Math.min(worldW, worldH);
    const arm = i % 2 === 0 ? 0 : Math.PI;
    const x = cx + Math.cos(theta + arm) * r;
    const vx = -Math.sin(theta + arm) * 0.22;
    const vy = 0.04;
    if (add(soa, x, y * worldH, vx, vy, -1, mass, 0, t) >= 0) spawned++;
    else break;
  }
  return { spawned, springs: [] };
}

export function spawnMandala(soa: ParticleSoA, opts: SpawnOpts): SpawnResult {
  const { worldW, worldH, mass } = opts;
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;
  const rings = 9;
  let spawned = 0;
  let i = 0;
  for (let ring = 1; ring <= rings && i < opts.count; ring++) {
    const n = Math.min(6 * ring, opts.count - i);
    const r = (ring / rings) * 0.42 * Math.min(worldW, worldH);
    for (let k = 0; k < n && i < opts.count; k++, i++) {
      const th = (k / n) * Math.PI * 2 + ring * 0.12;
      const x = cx + Math.cos(th) * r;
      const y = cy + Math.sin(th) * r;
      if (add(soa, x, y, 0, 0, -1, mass, 0, ring / rings) >= 0) spawned++;
      else return { spawned, springs: [] };
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

