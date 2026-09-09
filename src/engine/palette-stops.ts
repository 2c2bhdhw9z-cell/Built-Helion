/**
 * Custom N-stop palette support (Item 5). A palette is an ordered list of color
 * stops `{ pos, color }` where `pos` is a 0..1 position and `color` is a
 * "#rrggbb" hex string. This complements the built-in named palettes and the
 * two-stop colorA/colorB gradient (see palettes.ts) by allowing 3+ stops.
 *
 * All functions here are PURE (no canvas / DOM) so they are unit-testable. The
 * pixel-reading side of "extract from image" lives in the UI (needs a canvas);
 * the pure color BUCKETING/SELECTION used to build stops from those pixels is
 * `quantizeColors`, which is tested directly.
 */
import { parseTint } from "./palettes.ts";

export type PaletteStop = {
  /** Normalized position along the ramp, 0..1. */
  pos: number;
  /** "#rrggbb" color. */
  color: string;
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function toHex2(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

/**
 * Normalize an untrusted / editor stop list into a sorted, valid list:
 *  - drops entries with a non-#rrggbb color or non-finite pos,
 *  - clamps pos to 0..1,
 *  - sorts ascending by pos (stable for ties).
 * Returns a NEW array (never mutates the input).
 */
export function normalizeStops(stops: readonly PaletteStop[]): PaletteStop[] {
  const hex = /^#[0-9a-fA-F]{6}$/;
  const out: PaletteStop[] = [];
  for (const s of stops) {
    if (!s || typeof s.color !== "string" || !hex.test(s.color)) continue;
    if (typeof s.pos !== "number" || !Number.isFinite(s.pos)) continue;
    out.push({ pos: clamp01(s.pos), color: s.color.toLowerCase() });
  }
  out.sort((a, b) => a.pos - b.pos);
  return out;
}

/** True when a stop list holds enough valid stops to build a ramp. */
export function usesStops(stops: readonly PaletteStop[] | null | undefined): boolean {
  if (!stops) return false;
  return normalizeStops(stops).length >= 2;
}

/**
 * Sample the N-stop palette at t (0..1), returning normalized [r,g,b] in 0..1.
 * Linearly interpolates between the two surrounding stops; before the first /
 * after the last stop step-holds the endpoint color. Requires normalized input
 * (call normalizeStops first); an empty list returns black, a single stop
 * returns that color everywhere.
 */
export function sampleStopsN(stops: readonly PaletteStop[], t: number): [number, number, number] {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1) return parseTint(stops[0]!.color);
  const u = clamp01(t);
  if (u <= stops[0]!.pos) return parseTint(stops[0]!.color);
  const last = stops[stops.length - 1]!;
  if (u >= last.pos) return parseTint(last.color);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (u >= a.pos && u <= b.pos) {
      const span = b.pos - a.pos;
      const f = span <= 1e-9 ? 0 : (u - a.pos) / span;
      const [ar, ag, ab] = parseTint(a.color);
      const [br, bg, bb] = parseTint(b.color);
      return [ar + (br - ar) * f, ag + (bg - ag) * f, ab + (bb - ab) * f];
    }
  }
  return parseTint(last.color);
}

/**
 * Bake the N-stop palette into a 256x1 RGBA LUT (Uint8Array length 256*4),
 * tinted like the built-in palettes. Matches bakeStops/bakePalette output shape
 * so it can feed the same GPU/WebGL palette texture upload path.
 */
export function bakeStopsN(stops: readonly PaletteStop[], tint = "#ffffff"): Uint8Array {
  const data = new Uint8Array(256 * 4);
  const norm = normalizeStops(stops);
  const [tr, tg, tb] = parseTint(tint);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = sampleStopsN(norm, i / 255);
    const o = i * 4;
    data[o] = Math.round(r * 255 * tr);
    data[o + 1] = Math.round(g * 255 * tg);
    data[o + 2] = Math.round(b * 255 * tb);
    data[o + 3] = 255;
  }
  return data;
}

/**
 * Pure color quantizer for "extract palette from image". Given a flat RGBA
 * pixel array (as produced by a canvas getImageData().data), bucket colors into
 * a coarse cube, count populations, and return the top `count` bucket-average
 * colors as hex strings, ordered by descending population. Fully deterministic
 * and canvas-free so it is unit-testable; the UI supplies the pixels by
 * downscaling the image to a small offscreen canvas.
 *
 * `bits` controls the cube coarseness (per-channel bits kept, 1..8). Default 4
 * => 16 levels per channel. Fully transparent pixels are ignored.
 */
export function quantizeColors(rgba: ArrayLike<number>, count: number, bits = 4): string[] {
  const shift = 8 - Math.max(1, Math.min(8, bits));
  type Bucket = { r: number; g: number; b: number; n: number };
  const buckets = new Map<number, Bucket>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a === 0) continue;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const key = ((r >> shift) << 16) | ((g >> shift) << 8) | (b >> shift);
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const n = Math.max(1, Math.floor(count));
  return sorted.slice(0, n).map((bkt) => rgbToHex(bkt.r / bkt.n, bkt.g / bkt.n, bkt.b / bkt.n));
}

/**
 * Turn an ordered list of hex colors into evenly spaced palette stops (first at
 * 0, last at 1). A single color yields one stop at 0.
 */
export function colorsToStops(colors: readonly string[]): PaletteStop[] {
  const hex = /^#[0-9a-fA-F]{6}$/;
  const valid = colors.filter((c) => typeof c === "string" && hex.test(c)).map((c) => c.toLowerCase());
  if (valid.length === 0) return [];
  if (valid.length === 1) return [{ pos: 0, color: valid[0]! }];
  return valid.map((color, i) => ({ pos: i / (valid.length - 1), color }));
}
