import { DEFAULT_PARAMS, type LabParams } from "@/engine/types";

/**
 * The pure scoring objective for the closed-loop AI Tuner (Req 9.1; design
 * Property 8).
 *
 * This module is intentionally free of any I/O, network, or provider calls: it
 * exposes ONLY the pure, deterministic `scoreCandidate` function plus the
 * `AiObjective` shape the tuner (task 8.2) consumes. Because the score is a
 * total, deterministic function of its inputs, the tuner's hill-climb can keep
 * a best-so-far candidate and guarantee the returned score is `>=` its start
 * (Req 9.3) without ever touching the network.
 *
 * A prompt is turned into an {@link AiObjective} — a small set of *target
 * descriptors* in the normalized `[0, 1]` range (how much energy / turbulence /
 * brightness / density the described effect should have). A candidate parameter
 * set is projected onto the same descriptor space and scored by how closely it
 * matches the target. The prompt→objective extraction itself is not part of
 * this pure module (it may consult the provider for a starting point); this
 * module only scores a candidate once an objective exists.
 */

/**
 * A prompt-derived optimization target. Every descriptor is a normalized
 * `[0, 1]` value describing how much of that visual quality the requested
 * effect should exhibit:
 *
 * - `energy`     — overall motion / force intensity (gravity, force strength,
 *                  n-body / flow forces).
 * - `turbulence` — chaotic, swirling motion vs. smooth, laminar motion (flow,
 *                  swirl/expr forces, flocking, low drag).
 * - `brightness` — visual luminance / glow (bloom, additive blending, point
 *                  size, trails).
 * - `density`    — how tightly packed / cohesive the field feels (SPH cohesion,
 *                  flock cohesion, low drag retaining momentum).
 *
 * A descriptor left `undefined` is not part of the objective and does not
 * influence the score, so a prompt can target any subset of qualities.
 */
export interface AiObjective {
  energy?: number;
  turbulence?: number;
  brightness?: number;
  density?: number;
}

/** A candidate the tuner evaluates: any subset of LabParams overrides. */
export type Candidate = Partial<LabParams>;

/** The descriptor keys `scoreCandidate` knows how to compare. */
const DESCRIPTOR_KEYS = ["energy", "turbulence", "brightness", "density"] as const;
type DescriptorKey = (typeof DESCRIPTOR_KEYS)[number];

/** Clamp `n` into `[0, 1]`, mapping any non-finite input to `0`. */
function unit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Map a raw value onto `[0, 1]` by its magnitude relative to a reference scale.
 * `scale` is the value at which the descriptor is considered "fully" present.
 * Deterministic and total for any input (non-finite → 0).
 */
function ramp(value: number, scale: number): number {
  if (!Number.isFinite(value) || scale <= 0) return 0;
  return unit(Math.abs(value) / scale);
}

/**
 * Project a candidate parameter set onto the same normalized descriptor space
 * the objective is expressed in. Missing candidate fields fall back to
 * {@link DEFAULT_PARAMS}, so a partial candidate is always scorable. Pure and
 * deterministic: the same params always yield the same descriptors.
 *
 * The projection is a deliberately simple, monotonic reading of the params that
 * most plainly drive each visual quality — enough to give the tuner a smooth,
 * well-defined gradient to climb, not a physically exact model.
 */
function describe(params: Candidate): Record<DescriptorKey, number> {
  const p: LabParams = { ...DEFAULT_PARAMS, ...params };

  // Energy: gravity magnitude, explicit force strength, and the heavy-motion
  // subsystems (n-body G, flow strength) all raise the overall intensity.
  const gravityMag = Math.hypot(p.gravityX, p.gravityY);
  const energy = unit(
    0.35 * ramp(gravityMag, 3) +
      0.3 * ramp(p.forceKind === "off" ? 0 : p.forceStrength, 4) +
      0.2 * ramp(p.nbody ? p.nbodyG : 0, 0.05) +
      0.15 * ramp(p.flow ? p.flowStrength : 0, 4),
  );

  // Turbulence: swirling/expression forces, flow, and flocking all add chaos;
  // low drag lets that chaos persist rather than damping out.
  const swirlForce = p.forceKind === "swirl" || p.forceKind === "expr" || p.forceKind === "sine";
  const turbulence = unit(
    0.3 * ramp(p.flow ? p.flowStrength : 0, 4) +
      0.25 * (swirlForce ? ramp(p.forceStrength, 4) : 0) +
      0.2 * (p.flock ? unit(0.6 + ramp(p.flockSep, 3)) : 0) +
      0.25 * unit(1 - ramp(p.drag, 0.3)),
  );

  // Brightness: bloom (and its strength), additive blending, larger points, and
  // trails all read as more luminous / glowing.
  const brightness = unit(
    0.35 * (p.bloom ? unit(0.4 + ramp(p.bloomStrength, 4)) : 0) +
      0.25 * (p.blend === "additive" ? 1 : 0) +
      0.2 * ramp(p.pointSize, 8) +
      0.2 * (p.trails ? unit(ramp(p.trailLength, 1)) : 0),
  );

  // Density: SPH/flock cohesion pull particles together; low drag keeps the
  // field moving as a coherent body rather than dispersing.
  const density = unit(
    0.4 * (p.sph ? unit(ramp(p.sphCohesion, 1)) : 0) +
      0.35 * (p.flock ? unit(ramp(p.flockCoh, 2)) : 0) +
      0.25 * unit(1 - ramp(p.drag, 0.3)),
  );

  return { energy, turbulence, brightness, density };
}

/**
 * Score how well a candidate parameter set matches a prompt-derived objective
 * (Req 9.1; design Property 8 / `src/lib/ai/objective.ts`).
 *
 * PURE and DETERMINISTIC — no I/O, no network, no randomness, no clock. The same
 * `(objective, params)` always yields the same scalar. The tuner (task 8.2)
 * calls this as its injected `evaluate` function and, because it is total over
 * any params, can keep a best-so-far candidate and guarantee the returned score
 * is `>=` its starting candidate's (Req 9.3).
 *
 * The score is in `[0, 1]`, HIGHER IS BETTER: it is `1` when the candidate's
 * projected descriptors exactly match every targeted descriptor and decreases
 * smoothly with squared error as they diverge. Only descriptors present on the
 * objective contribute; an empty objective scores `1` for every candidate
 * (nothing to satisfy). Targets are clamped to `[0, 1]` so an out-of-range
 * objective still scores deterministically.
 *
 * @param objective the prompt-derived target descriptors (any subset)
 * @param params    the candidate parameter overrides to score
 * @returns         a scalar match score in `[0, 1]`, higher is better
 */
export function scoreCandidate(objective: AiObjective, params: Candidate): number {
  const actual = describe(params);

  let sumSqErr = 0;
  let count = 0;
  for (const key of DESCRIPTOR_KEYS) {
    const target = objective[key];
    if (target === undefined) continue;
    const diff = unit(target) - actual[key];
    sumSqErr += diff * diff;
    count += 1;
  }

  // An objective with no targeted descriptors is trivially satisfied.
  if (count === 0) return 1;

  // Mean squared error in [0, 1] → match score in [0, 1], higher is better.
  return unit(1 - sumSqErr / count);
}
