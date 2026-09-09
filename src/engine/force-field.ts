/**
 * Custom paintable vector force field. A coarse `res x res` grid of 2D vectors
 * stored in row-major order as a flat Float32Array of length `res * res * 2`
 * (x,y interleaved per cell). Coordinates are NORMALIZED (0..1) in both the
 * grid space and the sampling position, so the field is resolution- and
 * world-size independent and can be persisted verbatim in a creation config.
 *
 * All math here is PURE (no canvas / DOM / engine state) so it is directly
 * unit-testable: `sampleField` bilinearly samples the grid at a normalized
 * position, and `paintField` stamps a soft radial brush of a direction vector.
 */

/** Default grid resolution. Modest so it stays cheap to store and sample. */
export const FIELD_RES = 16;

/** Max grid resolution accepted from an untrusted (persisted) config. */
export const FIELD_MAX_RES = 64;

export type ForceField = {
  /** Cells per side. */
  res: number;
  /** Flat row-major vectors, length res*res*2 (vx,vy per cell). */
  data: Float32Array;
};

/** Create an empty (all-zero) field of the given resolution. */
export function createField(res: number = FIELD_RES): ForceField {
  const r = clampRes(res);
  return { res: r, data: new Float32Array(r * r * 2) };
}

function clampRes(res: number): number {
  const r = Math.round(res);
  if (!Number.isFinite(r) || r < 2) return 2;
  if (r > FIELD_MAX_RES) return FIELD_MAX_RES;
  return r;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** True when the field holds at least one non-zero vector. */
export function fieldHasData(field: ForceField | null | undefined): boolean {
  if (!field) return false;
  const d = field.data;
  for (let i = 0; i < d.length; i++) {
    if (d[i] !== 0) return true;
  }
  return false;
}

/**
 * Bilinearly sample the field at a normalized position (nx, ny in 0..1).
 * Returns the interpolated vector [vx, vy]. Positions are clamped into range so
 * an out-of-bounds particle samples the edge cell rather than reading garbage.
 */
export function sampleField(field: ForceField, nx: number, ny: number): [number, number] {
  const res = field.res;
  const d = field.data;
  const gx = clamp01(nx) * (res - 1);
  const gy = clamp01(ny) * (res - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(res - 1, x0 + 1);
  const y1 = Math.min(res - 1, y0 + 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const i00 = (y0 * res + x0) * 2;
  const i10 = (y0 * res + x1) * 2;
  const i01 = (y1 * res + x0) * 2;
  const i11 = (y1 * res + x1) * 2;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const vx = d[i00]! * w00 + d[i10]! * w10 + d[i01]! * w01 + d[i11]! * w11;
  const vy = d[i00 + 1]! * w00 + d[i10 + 1]! * w10 + d[i01 + 1]! * w01 + d[i11 + 1]! * w11;
  return [vx, vy];
}

/**
 * Paint a soft radial brush of the vector (dirX, dirY) into the field, centered
 * at the normalized position (nx, ny) with the given normalized `radius`.
 * Cells within the radius are blended toward the painted vector weighted by a
 * linear falloff and `strength` (0..1). Mutates and returns the field.
 */
export function paintField(
  field: ForceField,
  nx: number,
  ny: number,
  dirX: number,
  dirY: number,
  radius: number,
  strength: number,
): ForceField {
  const res = field.res;
  const d = field.data;
  const cx = clamp01(nx);
  const cy = clamp01(ny);
  const rad = Math.max(1e-4, radius);
  const s = clamp01(strength);
  for (let gy = 0; gy < res; gy++) {
    const py = gy / (res - 1);
    for (let gx = 0; gx < res; gx++) {
      const px = gx / (res - 1);
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > rad) continue;
      const fall = 1 - dist / rad;
      const w = fall * s;
      const idx = (gy * res + gx) * 2;
      d[idx] = d[idx]! + (dirX - d[idx]!) * w;
      d[idx + 1] = d[idx + 1]! + (dirY - d[idx + 1]!) * w;
    }
  }
  return field;
}

/** Zero every vector in the field in place. */
export function clearField(field: ForceField): void {
  field.data.fill(0);
}

/**
 * Serialize a field into a plain JSON-safe object for a creation config: the
 * resolution plus a plain number[] of the vectors.
 */
export type SerializedField = {
  res: number;
  data: number[];
};

export function serializeField(field: ForceField): SerializedField {
  return { res: field.res, data: Array.from(field.data) };
}

/**
 * Rebuild a field from an UNTRUSTED serialized value (persisted in a creation
 * config that anyone can craft). Returns null when the value is missing or
 * structurally invalid, so a hostile/garbage payload can never crash the
 * engine. Length is validated against the (clamped) resolution and any extra /
 * missing / non-finite entries are coerced to a zero-filled, correctly sized
 * grid.
 */
export function deserializeField(value: unknown): ForceField | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { res?: unknown; data?: unknown };
  if (typeof v.res !== "number" || !Array.isArray(v.data)) return null;
  const res = clampRes(v.res);
  const field = createField(res);
  const want = res * res * 2;
  const src = v.data;
  for (let i = 0; i < want && i < src.length; i++) {
    const n = src[i];
    field.data[i] = typeof n === "number" && Number.isFinite(n) ? n : 0;
  }
  return field;
}
