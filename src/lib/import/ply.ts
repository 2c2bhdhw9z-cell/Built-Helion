import type { CsvParticle } from "./csv";

/**
 * Parse an ASCII PLY point cloud into particles.
 *
 * We read the `element vertex N` count and the ordered `property` list from the
 * header, then read that many vertex lines from the body, pulling the x/y/z
 * columns by their property index. Only ASCII PLY is supported: `format
 * binary_*` is detected in the header and rejected with a clear error (binary
 * PLY is out of scope). Non-vertex elements (faces, edges) after the vertex
 * block are ignored — this is a point cloud, not a mesh.
 *
 * The 3D→2D projection matches obj.ts exactly (project onto the two largest
 * axes, normalize into the unit square, flip Y) so a PLY point cloud lands in
 * the same coordinate convention as an OBJ import and flows into the shared
 * spawn-from-samples path unchanged.
 */

type Vert = { x: number; y: number; z: number };

const MAX_VERTS = 1_000_000;

export function parsePly(text: string): CsvParticle[] {
  const lines = text.split(/\r?\n/);
  if (!lines[0] || lines[0].trim().toLowerCase() !== "ply") {
    // Not a PLY file at all — nothing to parse.
    return [];
  }

  let format: "ascii" | "binary" | null = null;
  let vertexCount = 0;
  // Property names in declared order for the CURRENT element; we only keep the
  // vertex element's list. `inVertex` tracks which element block we are reading
  // properties for so a face element's properties don't clobber the vertex map.
  let inVertex = false;
  const vertexProps: string[] = [];
  let headerEnd = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    const parts = line.split(/\s+/);
    const tag = parts[0]!.toLowerCase();
    if (tag === "format") {
      const f = (parts[1] ?? "").toLowerCase();
      if (f.startsWith("binary")) format = "binary";
      else if (f === "ascii") format = "ascii";
    } else if (tag === "element") {
      const name = (parts[1] ?? "").toLowerCase();
      inVertex = name === "vertex";
      if (inVertex) vertexCount = Math.max(0, Math.floor(Number(parts[2]) || 0));
    } else if (tag === "property") {
      // `property <type> <name>` for a scalar; skip `property list ...` (faces).
      if (inVertex && parts[1]?.toLowerCase() !== "list") {
        const name = parts[parts.length - 1]!.toLowerCase();
        vertexProps.push(name);
      }
    } else if (tag === "end_header") {
      headerEnd = i;
      break;
    }
  }

  if (headerEnd === -1) return [];
  if (format === "binary") {
    throw new Error("Binary PLY is not supported — export as ASCII PLY.");
  }
  if (vertexCount === 0 || vertexProps.length === 0) return [];

  const xi = vertexProps.indexOf("x");
  const yi = vertexProps.indexOf("y");
  const zi = vertexProps.indexOf("z");
  if (xi === -1 || yi === -1) return [];

  const verts: Vert[] = [];
  const limit = Math.min(vertexCount, MAX_VERTS);
  for (let i = headerEnd + 1; i < lines.length && verts.length < limit; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    const cols = line.split(/\s+/);
    const x = Number(cols[xi]);
    const y = Number(cols[yi]);
    const z = zi === -1 ? 0 : Number(cols[zi]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    verts.push({ x, y, z });
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
  // Project onto the two largest axes (same convention as obj.ts) so a Z-up or
  // Y-up cloud still fills the frame.
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
