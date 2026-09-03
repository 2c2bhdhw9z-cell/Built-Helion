import type { CsvParticle } from "./csv";

/** Vertices from a Wavefront OBJ (or XYZ lines). Positions only — no meshes. */

type Vert = { x: number; y: number; z: number };

export function parseObjVertices(text: string): CsvParticle[] {
  const verts: Vert[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    let x: number;
    let y: number;
    let z: number;
    if (tag === "v" && parts.length >= 4) {
      x = Number(parts[1]);
      y = Number(parts[2]);
      z = Number(parts[3]);
    } else if (parts.length >= 3 && tag !== "vn" && tag !== "vt" && Number.isFinite(Number(parts[0]))) {
      x = Number(parts[0]);
      y = Number(parts[1]);
      z = Number(parts[2]);
    } else {
      continue;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    verts.push({ x, y, z });
    if (verts.length >= 1_000_000) break;
  }
  if (verts.length === 0) return [];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  // Project onto the two largest axes so a Y-up model still fills the frame.
  const axes: Array<"x" | "y" | "z"> =
    spanY >= spanZ ? ["x", "y"] : spanX >= spanY ? ["x", "z"] : ["z", "y"];

  const out: CsvParticle[] = [];
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i]!;
    const a = axes[0] === "x" ? v.x : axes[0] === "y" ? v.y : v.z;
    const b = axes[1] === "x" ? v.x : axes[1] === "y" ? v.y : v.z;
    const minA = axes[0] === "x" ? minX : axes[0] === "y" ? minY : minZ;
    const minB = axes[1] === "x" ? minX : axes[1] === "y" ? minY : minZ;
    const spanA = Math.max(1e-6, axes[0] === "x" ? spanX : axes[0] === "y" ? spanY : spanZ);
    const spanB = Math.max(1e-6, axes[1] === "x" ? spanX : axes[1] === "y" ? spanY : spanZ);
    out.push({
      x: (a - minA) / spanA,
      y: 1 - (b - minB) / spanB,
      vx: 0,
      vy: 0,
      mass: 1,
      life: -1,
      phase: (i % 7) / 7,
    });
  }
  return out;
}
