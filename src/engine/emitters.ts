import { FLAG_CLOTH, FLAG_PINNED, type GeneratorKind, type Spring } from "./types";
import type { ParticleSoA } from "./soa";

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
      phase = (theta / (Math.PI * 2) % 1 + 1) % 1;
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
    if (add(soa, ox + randRange(-0.01, 0.01), oy, vx, vy, opts.lifespan || -1, opts.mass) >= 0)
      spawned++;
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
      add(
        soa,
        x,
        y,
        randRange(-0.05, 0.05),
        randRange(-0.05, 0.05),
        -1,
        opts.mass * randRange(0.4, 2.2),
      ) >= 0
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
      const i = add(
        soa,
        startX + x * spacing,
        startY + y * spacing,
        0,
        0,
        -1,
        opts.mass,
        pinned,
      );
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
  
  // Use offscreen canvas to render text
  let canvas;
  try {
    canvas = new OffscreenCanvas(600, 300);
  } catch {
    // Fallback if OffscreenCanvas not available
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 300;
    } else {
      return { spawned: 0, springs: [] };
    }
  }
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { spawned: 0, springs: [] };
  
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, 600, 300);
  
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 120px sans-serif';
  ctx.fillText((opts.textInput || "HELION").toUpperCase(), 300, 150);
  
  const imgData = ctx.getImageData(0, 0, 600, 300).data;
  
  let spawned = 0;
  const n = opts.count;
  
  // Collect all valid pixels
  const validPixels: {x: number, y: number}[] = [];
  for (let y = 0; y < 300; y += 2) {
    for (let x = 0; x < 600; x += 2) {
      const i = (y * 600 + x) * 4;
      if (imgData[i] > 128) {
        validPixels.push({ x: (x - 300) / 300, y: (y - 150) / 150 });
      }
    }
  }
  
  if (validPixels.length === 0) return { spawned: 0, springs: [] };
  
  const scale = Math.min(worldW, worldH) * 0.45;
  
  
  for (let i = 0; i < n; i++) {
    const p = validPixels[Math.floor(rand() * validPixels.length)];
    const x = cx + p.x * scale + randRange(-0.002, 0.002);
    const y = cy + p.y * scale + randRange(-0.002, 0.002);
    
    const vx = 0;
    const vy = 0;
    
    if (add(soa, x, y, vx, vy, -1, mass * randRange(0.8, 1.2)) >= 0) {

      spawned++;
    } else {
      break;
    }
  }
  
  return { spawned, springs: [] };
}
