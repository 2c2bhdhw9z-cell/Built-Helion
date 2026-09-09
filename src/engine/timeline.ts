/**
 * Timeline & keyframe animation of sim parameters (Item 1).
 *
 * A `Track` is an ORDERED list of keyframes `{ t, params }` where `t` is a time
 * in seconds and `params` is a partial of an ANIMATABLE subset of LabParams.
 * `sampleTimeline(track, t)` returns the interpolated params at time `t`:
 * numeric fields are linearly interpolated between the two surrounding
 * keyframes; non-numeric fields (palette, shape) step-hold the earlier
 * keyframe. Before the first / after the last keyframe the endpoint value holds.
 *
 * Everything here is PURE (no engine/store/DOM) so the sampler and the playback
 * controller state machine are directly unit-testable. The engine drives a
 * playhead each frame and applies the sampled params.
 */
import type { LabParams, PaletteId, ParticleShape } from "./types";

/**
 * The subset of LabParams the timeline can animate. Numeric fields tween;
 * `palette` and `shape` step-hold. Kept intentionally small so the UI and the
 * persisted track stay compact and predictable.
 */
export type AnimatableParams = Pick<
  LabParams,
  | "gravityX"
  | "gravityY"
  | "drag"
  | "pointSize"
  | "forceStrength"
  | "trailLength"
  | "flowStrength"
  | "bloomStrength"
  | "nbodyG"
  | "centralMass"
  | "palette"
  | "shape"
>;

/** The numeric keys that linearly interpolate. */
export const ANIMATABLE_NUMERIC_KEYS = [
  "gravityX",
  "gravityY",
  "drag",
  "pointSize",
  "forceStrength",
  "trailLength",
  "flowStrength",
  "bloomStrength",
  "nbodyG",
  "centralMass",
] as const satisfies readonly (keyof AnimatableParams)[];

/** The step-held (non-numeric) keys. */
export const ANIMATABLE_STEP_KEYS = ["palette", "shape"] as const satisfies readonly (keyof AnimatableParams)[];

export type AnimatableNumericKey = (typeof ANIMATABLE_NUMERIC_KEYS)[number];
export type AnimatableStepKey = (typeof ANIMATABLE_STEP_KEYS)[number];

export type Keyframe = {
  /** Time in seconds (>= 0). */
  t: number;
  /** The animated param values captured at this keyframe. */
  params: Partial<AnimatableParams>;
};

export type Track = {
  /** Keyframes, kept sorted ascending by `t` (see sortTrack/addKeyframe). */
  keys: Keyframe[];
  /** Loop playback back to 0 when the playhead passes the last keyframe. */
  loop: boolean;
};

export function createTrack(loop = true): Track {
  return { keys: [], loop };
}

/** The duration of a track (the last keyframe's time, or 0 when empty). */
export function trackDuration(track: Track): number {
  if (track.keys.length === 0) return 0;
  return track.keys[track.keys.length - 1]!.t;
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** Return a NEW track with keys sorted ascending by time (stable). */
export function sortTrack(track: Track): Track {
  return { ...track, keys: [...track.keys].sort((a, b) => a.t - b.t) };
}

/**
 * Add (or replace) a keyframe at time `t`. If a keyframe already exists at the
 * same time (within EPS) it is REPLACED so re-capturing at the current playhead
 * overwrites rather than stacking. Returns a NEW sorted track.
 */
const EPS = 1e-4;
export function addKeyframe(track: Track, t: number, params: Partial<AnimatableParams>): Track {
  const clean = Math.max(0, Number.isFinite(t) ? t : 0);
  const keys = track.keys.filter((k) => Math.abs(k.t - clean) > EPS);
  keys.push({ t: clean, params: { ...params } });
  keys.sort((a, b) => a.t - b.t);
  return { ...track, keys };
}

/** Remove the keyframe at index `i`. Returns a NEW track. */
export function removeKeyframe(track: Track, i: number): Track {
  if (i < 0 || i >= track.keys.length) return track;
  return { ...track, keys: track.keys.filter((_, idx) => idx !== i) };
}

/**
 * Sample the track at time `t`, returning the interpolated animatable params.
 * Rules:
 *  - empty track -> {} (no overrides)
 *  - single keyframe -> that keyframe's params everywhere
 *  - t <= first.t -> first keyframe's params (hold)
 *  - t >= last.t  -> last keyframe's params (hold)
 *  - between two keyframes -> numeric keys lerp; step keys hold the earlier one
 *
 * Only keys PRESENT on the surrounding keyframes are emitted; a key present on
 * one side but not the other holds the side that has it.
 */
export function sampleTimeline(track: Track, t: number): Partial<AnimatableParams> {
  const keys = track.keys;
  if (keys.length === 0) return {};
  if (keys.length === 1) return { ...keys[0]!.params };

  const time = Number.isFinite(t) ? t : 0;
  if (time <= keys[0]!.t) return { ...keys[0]!.params };
  const last = keys[keys.length - 1]!;
  if (time >= last.t) return { ...last.params };

  // Exact hit on an interior keyframe returns that keyframe verbatim (so a
  // step-held field reflects the keyframe you're sitting on, not the prior one).
  for (const k of keys) {
    if (Math.abs(k.t - time) <= EPS) return { ...k.params };
  }

  let lo = keys[0]!;
  let hi = last;
  for (let i = 0; i < keys.length - 1; i++) {
    if (time >= keys[i]!.t && time <= keys[i + 1]!.t) {
      lo = keys[i]!;
      hi = keys[i + 1]!;
      break;
    }
  }
  const span = hi.t - lo.t;
  const f = span <= EPS ? 0 : (time - lo.t) / span;

  const out: Partial<AnimatableParams> = {};
  for (const key of ANIMATABLE_NUMERIC_KEYS) {
    const a = lo.params[key];
    const b = hi.params[key];
    if (typeof a === "number" && typeof b === "number") {
      out[key] = lerp(a, b, f);
    } else if (typeof a === "number") {
      out[key] = a;
    } else if (typeof b === "number") {
      out[key] = b;
    }
  }
  // Step-held keys hold the earlier keyframe's value across the interval.
  const paletteA = lo.params.palette ?? hi.params.palette;
  if (paletteA !== undefined) out.palette = paletteA as PaletteId;
  const shapeA = lo.params.shape ?? hi.params.shape;
  if (shapeA !== undefined) out.shape = shapeA as ParticleShape;

  return out;
}

/**
 * The playback controller state machine (pure). Holds a playhead and whether it
 * is playing; `advance(dt)` moves the playhead when playing, wrapping to 0 at
 * the end when the track loops or clamping and pausing when it does not. Kept
 * pure so it is fully testable; the engine calls `advance` each frame and reads
 * `playhead`.
 */
export type TimelineState = {
  playing: boolean;
  playhead: number;
};

export function createTimelineState(): TimelineState {
  return { playing: false, playhead: 0 };
}

/**
 * Advance the playhead by `dt` seconds when playing. Returns a NEW state.
 * At/after the track end:
 *  - loop: wrap the overshoot back to the start (modulo duration).
 *  - no loop: clamp to the end and stop playing.
 * A zero-duration track (0 or 1 keyframe) stays at 0 and stops when not looping.
 */
export function advanceTimeline(state: TimelineState, track: Track, dt: number): TimelineState {
  if (!state.playing) return state;
  const dur = trackDuration(track);
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  let head = state.playhead + step;
  if (dur <= EPS) {
    // Nothing to animate across; hold at 0 and stop if not looping.
    return { playing: track.loop, playhead: 0 };
  }
  if (head >= dur) {
    if (track.loop) {
      head = head % dur;
      return { playing: true, playhead: head };
    }
    return { playing: false, playhead: dur };
  }
  return { playing: true, playhead: head };
}

/** Set the playhead directly (scrubbing), clamped to [0, duration]. */
export function scrubTimeline(state: TimelineState, track: Track, t: number): TimelineState {
  const dur = trackDuration(track);
  const clamped = Math.max(0, Math.min(dur, Number.isFinite(t) ? t : 0));
  return { ...state, playhead: clamped };
}

/**
 * Normalize an UNTRUSTED serialized track (persisted in a creation config that
 * anyone can craft). Drops malformed keyframes, keeps only valid animatable
 * keys/values, clamps times to >= 0, and sorts. Returns null when there is
 * nothing usable so callers can treat "no timeline" cleanly.
 */
export function normalizeTrack(value: unknown): Track | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { keys?: unknown; loop?: unknown };
  if (!Array.isArray(v.keys)) return null;
  const numeric = new Set<string>(ANIMATABLE_NUMERIC_KEYS);
  const keys: Keyframe[] = [];
  for (const raw of v.keys) {
    if (!raw || typeof raw !== "object") continue;
    const k = raw as { t?: unknown; params?: unknown };
    if (typeof k.t !== "number" || !Number.isFinite(k.t)) continue;
    if (!k.params || typeof k.params !== "object") continue;
    const src = k.params as Record<string, unknown>;
    const params: Partial<AnimatableParams> = {};
    for (const nk of numeric) {
      const val = src[nk];
      if (typeof val === "number" && Number.isFinite(val)) {
        (params as Record<string, number>)[nk] = val;
      }
    }
    if (typeof src.palette === "string") params.palette = src.palette as PaletteId;
    if (typeof src.shape === "string") params.shape = src.shape as ParticleShape;
    if (Object.keys(params).length === 0) continue;
    keys.push({ t: Math.max(0, k.t), params });
  }
  if (keys.length === 0) return null;
  keys.sort((a, b) => a.t - b.t);
  return { keys, loop: v.loop !== false };
}
