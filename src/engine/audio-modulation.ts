/**
 * Audio-reactive parameter modulation (Item 2). A small PURE mapping structure
 * describes how an audio signal drives one or more sim targets, and
 * `applyAudioModulation` returns a NEW params object with the mapped targets
 * modulated. No DOM / AudioContext here — the live signal is captured by
 * `AudioManager` (see audio.ts) and passed in as a plain `AudioSignal`, so this
 * module is fully unit-testable.
 */
import type { LabParams } from "./types";

/** The audio signals the AnalyserNode already computes (see audio.ts). */
export type AudioSource = "bass" | "mid" | "level";

/** The sim targets an audio signal can drive. */
export type AudioTarget = "size" | "spawn" | "force" | "gravity" | "palette";

/** One source -> target mapping with a 0..2 amount (0 = off). */
export type AudioMapping = {
  source: AudioSource;
  target: AudioTarget;
  amount: number;
};

/** A frame's audio reading, normalized to 0..1 per band. */
export type AudioSignal = {
  bass: number;
  mid: number;
  level: number;
};

/**
 * The extra, non-param outputs of audio modulation that the engine applies
 * outside LabParams: a spawn-burst intensity (0..1) and a palette-cycle phase
 * offset (0..1) accumulated over time. Kept separate so `applyAudioModulation`
 * stays a pure params transform and the caller decides how to act on these.
 */
export type AudioModOutputs = {
  /** 0..1 burst intensity for the "spawn" target this frame. */
  spawnBurst: number;
  /** 0..1 additive palette phase for the "palette" target this frame. */
  palettePulse: number;
};

export const AUDIO_SOURCES: readonly AudioSource[] = ["bass", "mid", "level"];
export const AUDIO_TARGETS: readonly AudioTarget[] = ["size", "spawn", "force", "gravity", "palette"];

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Read a signal value (0..1) for a source, defaulting missing bands to 0. */
export function signalValue(signal: AudioSignal, source: AudioSource): number {
  const v = source === "bass" ? signal.bass : source === "mid" ? signal.mid : signal.level;
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

/**
 * Apply a set of audio mappings to `params`, returning a NEW params object plus
 * the non-param outputs (spawn burst, palette pulse). The base params are never
 * mutated. `sensitivity` scales every mapping uniformly (the existing
 * audioSensitivity knob). A mapping with amount<=0 is a no-op.
 *
 *  - size    -> multiplies pointSize by (1 + v), clamped to a sane max.
 *  - force   -> adds to forceStrength (proportional to v).
 *  - gravity -> pushes gravityY downward proportional to v.
 *  - spawn   -> accumulates a 0..1 spawnBurst (engine decides how to spawn).
 *  - palette -> accumulates a 0..1 palettePulse (engine can cycle colors).
 */
export function applyAudioModulation(
  params: LabParams,
  signal: AudioSignal,
  mappings: readonly AudioMapping[],
  sensitivity = 1,
): { params: LabParams; outputs: AudioModOutputs } {
  const next: LabParams = { ...params };
  const outputs: AudioModOutputs = { spawnBurst: 0, palettePulse: 0 };
  const sens = Number.isFinite(sensitivity) ? Math.max(0, sensitivity) : 1;

  for (const m of mappings) {
    const amt = Number.isFinite(m.amount) ? Math.max(0, m.amount) : 0;
    if (amt <= 0) continue;
    const v = signalValue(signal, m.source) * amt * sens;
    if (v <= 0) continue;
    switch (m.target) {
      case "size":
        next.pointSize = clamp(params.pointSize * (1 + v * 0.9), 1, 48);
        break;
      case "force":
        next.forceStrength = clamp(params.forceStrength + v * 3, 0, 20);
        break;
      case "gravity":
        next.gravityY = clamp(params.gravityY + v * 2, -20, 20);
        break;
      case "spawn":
        outputs.spawnBurst = clamp(outputs.spawnBurst + v, 0, 1);
        break;
      case "palette":
        outputs.palettePulse = clamp(outputs.palettePulse + v, 0, 1);
        break;
    }
  }

  return { params: next, outputs };
}

/** The default mapping set when a user first enables audio-reactive mode. */
export const DEFAULT_AUDIO_MAPPINGS: AudioMapping[] = [
  { source: "bass", target: "size", amount: 1 },
  { source: "level", target: "force", amount: 0.6 },
];

/**
 * Normalize an untrusted mapping list (persisted in a creation config): drop
 * entries with an unknown source/target, clamp amount to 0..2. Returns a new
 * array; never throws.
 */
export function normalizeMappings(value: unknown): AudioMapping[] {
  if (!Array.isArray(value)) return [];
  const out: AudioMapping[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as { source?: unknown; target?: unknown; amount?: unknown };
    if (!AUDIO_SOURCES.includes(m.source as AudioSource)) continue;
    if (!AUDIO_TARGETS.includes(m.target as AudioTarget)) continue;
    const amount = typeof m.amount === "number" && Number.isFinite(m.amount) ? clamp(m.amount, 0, 2) : 0;
    out.push({ source: m.source as AudioSource, target: m.target as AudioTarget, amount });
  }
  return out;
}
