import type { PaletteId } from "./types";

type Stop = [number, number, number];

const STOPS: Record<PaletteId, Stop[]> = {
  rainbow: [
    [220, 32, 64],
    [255, 128, 24],
    [255, 214, 48],
    [46, 196, 92],
    [36, 156, 255],
    [92, 72, 255],
    [188, 56, 210],
  ],
  ember: [
    [8, 4, 6],
    [92, 14, 8],
    [188, 42, 10],
    [255, 118, 24],
    [255, 198, 86],
    [255, 246, 220],
  ],
  ice: [
    [4, 10, 22],
    [12, 48, 92],
    [24, 128, 186],
    [120, 210, 255],
    [236, 248, 255],
  ],
  aurora: [
    [4, 18, 16],
    [12, 78, 68],
    [36, 168, 132],
    [140, 232, 188],
    [230, 255, 242],
  ],
  solar: [
    [18, 8, 2],
    [160, 62, 8],
    [240, 148, 28],
    [255, 214, 110],
    [255, 248, 226],
  ],
  mono: [
    [12, 13, 16],
    [90, 94, 104],
    [188, 192, 200],
    [244, 246, 248],
  ],
  plasma: [
    [6, 8, 28],
    [20, 64, 168],
    [48, 168, 210],
    [255, 170, 70],
    [255, 244, 220],
  ],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function samplePalette(id: PaletteId, t: number): [number, number, number] {
  const stops = STOPS[id];
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [lerp(a[0], b[0], f) / 255, lerp(a[1], b[1], f) / 255, lerp(a[2], b[2], f) / 255];
}

export function parseTint(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function bakePalette(id: PaletteId, tint = "#ffffff"): Uint8Array {
  const data = new Uint8Array(256 * 4);
  const [tr, tg, tb] = parseTint(tint);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = samplePalette(id, i / 255);
    const o = i * 4;
    data[o] = Math.round(r * 255 * tr);
    data[o + 1] = Math.round(g * 255 * tg);
    data[o + 2] = Math.round(b * 255 * tb);
    data[o + 3] = 255;
  }
  return data;
}

/** Two-stop gradient used when colorA !== colorB. Tinted like a named palette. */
export function usesCustomStops(colorA: string, colorB: string): boolean {
  return (colorA || "#ffffff").toLowerCase() !== (colorB || "#ffffff").toLowerCase();
}

export function bakeStops(colorA: string, colorB: string, tint = "#ffffff"): Uint8Array {
  const data = new Uint8Array(256 * 4);
  const [ar, ag, ab] = parseTint(colorA);
  const [br, bg, bb] = parseTint(colorB);
  const [tr, tg, tb] = parseTint(tint);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const o = i * 4;
    data[o] = Math.round((ar + (br - ar) * t) * 255 * tr);
    data[o + 1] = Math.round((ag + (bg - ag) * t) * 255 * tg);
    data[o + 2] = Math.round((ab + (bb - ab) * t) * 255 * tb);
    data[o + 3] = 255;
  }
  return data;
}

export function sampleStops(colorA: string, colorB: string, t: number): [number, number, number] {
  const [ar, ag, ab] = parseTint(colorA);
  const [br, bg, bb] = parseTint(colorB);
  const u = Math.min(1, Math.max(0, t));
  return [ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u];
}

export const PALETTE_IDS: PaletteId[] = ["rainbow", "ember", "ice", "aurora", "solar", "mono", "plasma"];
