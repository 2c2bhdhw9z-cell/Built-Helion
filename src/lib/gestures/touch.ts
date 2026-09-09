/**
 * Pure touch-gesture decision helpers (Item 17).
 *
 * The live pointer handling in canvas-stage.tsx is a stateful machine over DOM
 * PointerEvents (pinch-zoom, two-finger pan, single-finger brush painting, and
 * now long-press). The DOM parts can't run headlessly, but the DECISIONS can be
 * factored out and unit-tested: which gesture a set of active pointers implies,
 * the pinch scale from two pointers, and whether a press has become a
 * long-press (held past a threshold without moving too far).
 */

export type Pointer = { x: number; y: number };

export type GestureKind = "none" | "paint" | "pan-zoom";

/**
 * Classify the active gesture purely from the number of active pointers:
 *   - 0 pointers -> "none"
 *   - 1 pointer  -> "paint" (single-finger brush painting stays intact)
 *   - 2+ pointers -> "pan-zoom" (pinch-zoom + two-finger pan)
 * Kept trivial and total so the live handler can assert its branches against it.
 */
export function classifyGesture(pointerCount: number): GestureKind {
  if (pointerCount <= 0) return "none";
  if (pointerCount === 1) return "paint";
  return "pan-zoom";
}

/** Euclidean distance between two pointers (>= a tiny epsilon to avoid /0). */
export function pointerDistance(a: Pointer, b: Pointer): number {
  return Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
}

/** Midpoint of two pointers (the pinch/pan anchor). */
export function pointerMidpoint(a: Pointer, b: Pointer): Pointer {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The pinch zoom multiplier for a move: current distance / distance at the start
 * of the pinch. Applied to the zoom captured when the pinch began.
 */
export function pinchScale(startDist: number, currentDist: number): number {
  return currentDist / Math.max(startDist, 1);
}

export const LONG_PRESS_MS = 480;
/** Max movement (px) allowed during the hold before it's treated as a drag, not a long-press. */
export const LONG_PRESS_MOVE_TOLERANCE = 12;

/**
 * Decide whether a single-pointer press has become a long-press: it must be a
 * single active pointer (a second finger converts it to pan-zoom), held at least
 * `holdMs` since pointerdown, and moved no farther than `moveTolerance` from the
 * start point. Pure so the timing/movement policy is unit-testable without a DOM.
 */
export function isLongPress(opts: {
  pointerCount: number;
  elapsedMs: number;
  movedPx: number;
  holdMs?: number;
  moveTolerance?: number;
}): boolean {
  const holdMs = opts.holdMs ?? LONG_PRESS_MS;
  const moveTolerance = opts.moveTolerance ?? LONG_PRESS_MOVE_TOLERANCE;
  return (
    opts.pointerCount === 1 &&
    opts.elapsedMs >= holdMs &&
    opts.movedPx <= moveTolerance
  );
}
