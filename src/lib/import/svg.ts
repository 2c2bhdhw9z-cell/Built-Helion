import type { CsvParticle } from "./csv";

/**
 * Parse an SVG document into particles by sampling points along its outlines.
 *
 * We extract geometry from three sources without a DOM (pure string parsing so
 * it runs identically in the browser, in Node tests, and on the server):
 *   - `<path d="…">` — the `d` command stream. We handle M/L/H/V and the curve
 *     commands C/Q (cubic/quadratic Béziers) plus their relative lowercase
 *     forms, flattening curves into short line segments. Z/z close the current
 *     subpath. Unsupported commands (A arcs, S/T smooth curves) are skipped
 *     gracefully rather than throwing.
 *   - `<polygon points="…">` / `<polyline points="…">` — the raw point list.
 *
 * The collected points are then normalized into the unit square with Y flipped
 * (SVG's Y grows downward; the engine's does not), matching the coordinate
 * convention csv/obj/ply use so the result flows into the shared
 * spawn-from-samples path unchanged. Malformed input yields an empty array
 * rather than throwing.
 */

type Pt = { x: number; y: number };

const MAX_POINTS = 200_000;
/** Segments a Bézier curve is flattened into. Small and fixed — bounded work. */
const CURVE_STEPS = 12;

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Pull every number (incl. signs, decimals, exponents) out of a token run. */
function numbers(s: string): number[] {
  const out: number[] = [];
  const re = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Sample points along one `d` path command stream. */
function samplePath(d: string, out: Pt[]): void {
  // Split into command tokens: a letter followed by its number arguments.
  const tokens = d.match(/[MmLlHhVvCcQqZzAaSsTt][^MmLlHhVvCcQqZzAaSsTt]*/g);
  if (!tokens) return;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  for (const token of tokens) {
    if (out.length >= MAX_POINTS) return;
    const cmd = token[0]!;
    const rel = cmd === cmd.toLowerCase();
    const args = numbers(token.slice(1));
    switch (cmd.toUpperCase()) {
      case "M": {
        // First pair is a move; subsequent pairs are implicit line-tos.
        for (let i = 0; i + 1 < args.length; i += 2) {
          const p = rel
            ? { x: cur.x + args[i]!, y: cur.y + args[i + 1]! }
            : { x: args[i]!, y: args[i + 1]! };
          cur = p;
          if (i === 0) start = p;
          out.push(p);
        }
        break;
      }
      case "L": {
        for (let i = 0; i + 1 < args.length; i += 2) {
          cur = rel
            ? { x: cur.x + args[i]!, y: cur.y + args[i + 1]! }
            : { x: args[i]!, y: args[i + 1]! };
          out.push(cur);
        }
        break;
      }
      case "H": {
        for (const a of args) {
          cur = { x: rel ? cur.x + a : a, y: cur.y };
          out.push(cur);
        }
        break;
      }
      case "V": {
        for (const a of args) {
          cur = { x: cur.x, y: rel ? cur.y + a : a };
          out.push(cur);
        }
        break;
      }
      case "C": {
        for (let i = 0; i + 5 < args.length; i += 6) {
          const c1 = rel ? { x: cur.x + args[i]!, y: cur.y + args[i + 1]! } : { x: args[i]!, y: args[i + 1]! };
          const c2 = rel ? { x: cur.x + args[i + 2]!, y: cur.y + args[i + 3]! } : { x: args[i + 2]!, y: args[i + 3]! };
          const end = rel ? { x: cur.x + args[i + 4]!, y: cur.y + args[i + 5]! } : { x: args[i + 4]!, y: args[i + 5]! };
          for (let s = 1; s <= CURVE_STEPS; s++) out.push(cubic(cur, c1, c2, end, s / CURVE_STEPS));
          cur = end;
        }
        break;
      }
      case "Q": {
        for (let i = 0; i + 3 < args.length; i += 4) {
          const c1 = rel ? { x: cur.x + args[i]!, y: cur.y + args[i + 1]! } : { x: args[i]!, y: args[i + 1]! };
          const end = rel ? { x: cur.x + args[i + 2]!, y: cur.y + args[i + 3]! } : { x: args[i + 2]!, y: args[i + 3]! };
          for (let s = 1; s <= CURVE_STEPS; s++) out.push(quad(cur, c1, end, s / CURVE_STEPS));
          cur = end;
        }
        break;
      }
      case "Z": {
        cur = start;
        break;
      }
      default:
        // A/S/T and anything else: unsupported, skip gracefully.
        break;
    }
  }
}

/** Sample the `points="x,y x,y …"` attribute of a polygon/polyline. */
function samplePoints(attr: string, out: Pt[]): void {
  const nums = numbers(attr);
  for (let i = 0; i + 1 < nums.length && out.length < MAX_POINTS; i += 2) {
    out.push({ x: nums[i]!, y: nums[i + 1]! });
  }
}

export function parseSvg(text: string): CsvParticle[] {
  if (!text || !/<svg[\s>]/i.test(text)) return [];
  const pts: Pt[] = [];

  const pathRe = /<path\b[^>]*\bd\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(text)) && pts.length < MAX_POINTS) {
    samplePath(m[2] ?? m[3] ?? "", pts);
  }

  const polyRe = /<(?:polygon|polyline)\b[^>]*\bpoints\s*=\s*("([^"]*)"|'([^']*)')/gi;
  while ((m = polyRe.exec(text)) && pts.length < MAX_POINTS) {
    samplePoints(m[2] ?? m[3] ?? "", pts);
  }

  if (pts.length === 0) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return [];
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  const out: CsvParticle[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    out.push({
      x: (p.x - minX) / spanX,
      // SVG Y grows downward; flip so the shape reads upright like the others.
      y: 1 - (p.y - minY) / spanY,
      vx: 0,
      vy: 0,
      mass: 1,
      life: -1,
      phase: (out.length % 7) / 7,
    });
  }
  return out;
}
