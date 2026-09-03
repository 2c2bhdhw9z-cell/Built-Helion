/**
 * View camera helpers.
 *
 * Two zoom products share the same slider:
 * - Letterbox (fillFrame off): CSS scale. Zoom-out shrinks the picture.
 * - Fill frame (on): zoom-out grows world bounds around the current field so
 *   the leftover screen is real playground, not unused chrome.
 * Zoom-in is always a CSS crop/magnify. Reset view returns world scale to 1.
 */

export const MIN_VIEW_ZOOM = 0.4;
export const MAX_VIEW_ZOOM = 8;

export function clampViewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, zoom));
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
