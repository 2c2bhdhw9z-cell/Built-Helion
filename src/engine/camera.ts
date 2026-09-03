/**
 * View camera helpers.
 *
 * Two zoom products share the same slider:
 * - Letterbox (fillFrame off): CSS scale. Zoom-out shrinks the picture.
 * - Fill frame (on): zoom-out grows world bounds around the current field so
 *   the leftover screen is real playground, not unused chrome.
 * Zoom-in is always a CSS crop/magnify. Reset view returns world scale to 1.
 *
 * Orbit is a real perspective camera around the z=0 particle plane (not a CSS
 * spin of the whole canvas). Yaw=0 and pitch=0 is an identity projection so
 * pointers and physics stay in the same space as before.
 */

export const MIN_VIEW_ZOOM = 0.4;
export const MAX_VIEW_ZOOM = 8;
export const MIN_VIEW_PITCH = 0;
export const MAX_VIEW_PITCH = 72;
/** Camera distance in NDC units. Identity projection uses persp = 1. */
export const ORBIT_CAM = 2.4;

export function clampViewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, zoom));
}

export function clampViewPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0;
  return Math.min(MAX_VIEW_PITCH, Math.max(MIN_VIEW_PITCH, pitch));
}

/** World-size multiplier. 1 at rest; 1/zoom when fill-frame is zoomed out. */
export function fillWorldScale(fillFrame: boolean, zoom: number): number {
  const z = clampViewZoom(zoom);
  if (!fillFrame || z >= 1) return 1;
  return 1 / z;
}

/** CSS scale applied to the canvas wrapper. 1 when fill-frame is eating zoom-out. */
export function viewCssScale(fillFrame: boolean, zoom: number): number {
  const z = clampViewZoom(zoom);
  if (fillFrame && z < 1) return 1;
  return z;
}

/** True when pan should ride CSS (letterbox or magnified crop), not world bounds. */
export function viewCssPanEnabled(fillFrame: boolean, zoom: number): boolean {
  return viewCssScale(fillFrame, zoom) !== 1 || !fillFrame || clampViewZoom(zoom) >= 1;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export type OrbitProjected = { nx: number; ny: number; scale: number };

/**
 * Project a world-space particle (x right, y down, z=0) through yaw/pitch.
 * Identity when yaw and pitch are 0.
 */
export function projectOrbit(
  x: number,
  y: number,
  worldW: number,
  worldH: number,
  yaw: number,
  pitch: number,
): OrbitProjected {
  const w = Math.max(worldW, 1e-6);
  const h = Math.max(worldH, 1e-6);
  const px = (x / w) * 2 - 1;
  const py = 1 - (y / h) * 2;
  if (Math.abs(yaw) < 1e-8 && Math.abs(pitch) < 1e-8) {
    return { nx: px, ny: py, scale: 1 };
  }
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = px * cy;
  const z1 = -px * sy;
  const y2 = py * cp - z1 * sp;
  const z2 = py * sp + z1 * cp;
  const zCam = ORBIT_CAM - z2;
  const persp = ORBIT_CAM / Math.max(zCam, 0.2);
  return { nx: x1 * persp, ny: y2 * persp, scale: persp };
}

/**
 * Inverse of projectOrbit: NDC from a pointer → world on the z=0 plane.
 * Identity when yaw and pitch are 0.
 */
export function unprojectOrbit(
  nx: number,
  ny: number,
  worldW: number,
  worldH: number,
  yaw: number,
  pitch: number,
): { x: number; y: number } {
  const w = Math.max(worldW, 1e-6);
  const h = Math.max(worldH, 1e-6);
  if (Math.abs(yaw) < 1e-8 && Math.abs(pitch) < 1e-8) {
    return { x: ((nx + 1) * 0.5) * w, y: ((1 - ny) * 0.5) * h };
  }
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cam = ORBIT_CAM;
  const denom = cam * cp * cy - nx * sy + ny * sp * cy;
  const t = (cam * cp * cy) / (Math.abs(denom) < 1e-6 ? 1e-6 : denom);
  const x2 = t * nx;
  const y2 = t * ny;
  const z2 = cam * (1 - t);
  const x1 = x2;
  const y1 = y2 * cp + z2 * sp;
  const z1 = -y2 * sp + z2 * cp;
  const px = x1 * cy - z1 * sy;
  const py = y1;
  return { x: ((px + 1) * 0.5) * w, y: ((1 - py) * 0.5) * h };
}

/** History-buffer fade. Longer trails persist more; never invent a trail. */
export function trailFadeAlpha(decay: number, length: number): number {
  const d = Number.isFinite(decay) ? decay : 0.22;
  const persist = Math.max(0.12, Number.isFinite(length) ? length : 0.72);
  return Math.min(0.55, Math.max(0.03, d / persist));
}
