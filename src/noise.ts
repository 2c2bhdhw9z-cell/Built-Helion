// CPU port of the "Flow" field force.
//
// shaders.ts implements Flow as curl-noise built on an Ashima-style 3D
// simplex noise (see snoise3 / curlNoise near the top of shaders.ts), but
// that force is only ever applied inside the WGSL compute kernel — the CPU
// path in physics.ts has no equivalent, so toggling Flow on does nothing
// whenever the app has fallen back to WebGL/Canvas2D (i.e. whenever WebGPU
// isn't the active backend).
//
// This file provides a standard, self-consistent 3D simplex noise
// (classic Gustavson permutation-table formulation, not the Ashima
// variant used in the WGSL) plus a matching 2D curl-noise helper, so the
// CPU path can apply the same *kind* of force. It will not produce
// bit-identical values to the GPU version — different noise algorithms,
// different pseudo-random gradients — but it's smooth, continuous, and
// behaves the same way: a swirling turbulence field that shifts over time.

// Deterministic PRNG (mulberry32) used only to build the permutation
// table below, so the table is reproducible without hand-transcribing
// 256 numbers (and risking a typo that subtly breaks the noise).
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function (): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPermutation(seed: number): Uint8Array {
  const rand = mulberry32(seed);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = base[i]!;
    base[i] = base[j]!;
    base[j] = tmp;
  }
  const doubled = new Uint8Array(512);
  for (let i = 0; i < 512; i++) doubled[i] = base[i & 255]!;
  return doubled;
}

// Fixed seed: the exact noise field doesn't need to vary run to run, it
// just needs to be smooth and consistent within a session.
const PERM = buildPermutation(1337);

// The 12 standard "edge of cube" gradients used by classic 3D simplex
// noise implementations.
const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

const F3 = 1 / 3;
const G3 = 1 / 6;

function gradIndex(ix: number, iy: number, iz: number): number {
  return PERM[(ix + PERM[(iy + PERM[iz & 255]!) & 255]!) & 255]! % 12;
}

/** Classic (Gustavson-style) 3D simplex noise, roughly in [-1, 1]. */
export function snoise3(x: number, y: number, z: number): number {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const X0 = i - t, Y0 = j - t, Z0 = k - t;
  const x0 = x - X0, y0 = y - Y0, z0 = z - Z0;

  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }

  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;

  const ii = i & 255, jj = j & 255, kk = k & 255;

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 >= 0) {
    t0 *= t0;
    const g = GRAD3[gradIndex(ii, jj, kk)]!;
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 >= 0) {
    t1 *= t1;
    const g = GRAD3[gradIndex(ii + i1, jj + j1, kk + k1)]!;
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 >= 0) {
    t2 *= t2;
    const g = GRAD3[gradIndex(ii + i2, jj + j2, kk + k2)]!;
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 >= 0) {
    t3 *= t3;
    const g = GRAD3[gradIndex(ii + 1, jj + 1, kk + 1)]!;
    n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
  }

  return 32 * (n0 + n1 + n2 + n3);
}

/**
 * 2D curl of a 3D noise field, matching the structure of curlNoise() in
 * shaders.ts: sample the scalar field at four offset points, take the
 * perpendicular of the gradient, normalize to a unit vector (or [0,0] if
 * the field is ~flat there). z is typically time * flowSpeed, so the
 * field animates.
 */
export function curlNoise2D(x: number, y: number, z: number): [number, number] {
  const e = 0.01;
  const pX0 = snoise3(x - e, y, z);
  const pX1 = snoise3(x + e, y, z);
  const pY0 = snoise3(x, y - e, z);
  const pY1 = snoise3(x, y + e, z);

  const cx = pY1 - pY0;
  const cy = pX0 - pX1;
  const len = Math.sqrt(cx * cx + cy * cy);
  if (len < 0.0001) return [0, 0];
  return [cx / len, cy / len];
}
