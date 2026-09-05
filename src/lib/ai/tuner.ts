import { DEFAULT_PARAMS, type LabParams } from "@/engine/types";
import { labParamsSchema } from "@/lib/creations/types";
import type { AiObjective, Candidate } from "@/lib/ai/objective";

/**
 * The closed-loop AI Tuner (Req 9; design Property 8 & 9).
 *
 * This module is PURE over an INJECTED `evaluate` function: `runTuner` performs
 * a bounded local optimization (coordinate descent / hill-climb) toward a
 * prompt-derived objective, and it performs NO network, provider, or clock I/O.
 * The scoring itself lives behind the injected `evaluate` callback — in the real
 * wiring that is `(candidate) => scoreCandidate(objective, candidate)` from
 * `src/lib/ai/objective.ts` (task 8.1) — so the whole optimizer loop is fully
 * deterministic given its inputs and unit/property-testable without a network
 * or an API key.
 *
 * Contract (Requirement 9):
 * - Start from the caller-supplied `seed` candidate and run AT LEAST TWO
 *   evaluation iterations before returning (Req 9.2).
 * - Keep the best-so-far candidate and RETURN a candidate whose objective score
 *   is `>=` the seed's score (Req 9.3) — the seed is always in the running, so
 *   the tuner never returns something worse than where it started (when nothing
 *   improves it returns the seed unchanged; design Property 8).
 * - CLAMP every returned parameter to the simulator's valid range via
 *   `labParamsSchema` so the output is always in-range (Req 9.4; Property 9).
 * - Operate ONLY on the given inputs — never fabricate a starting point. The
 *   candidate generator (task 8.5, `functions.ts`) may consult the provider
 *   once for a `seed`; if that provider start is UNAVAILABLE the AI_Service
 *   returns an error and never fabricates params (Req 9.5). That provider-failure
 *   handling lives in 8.5 — this pure module simply requires a `seed` as input.
 */

/**
 * The tuner's request: the (pure) evaluation callback plus the starting
 * candidate. `prompt` is carried through for provenance/telemetry only — the
 * optimizer's behavior is driven entirely by `evaluate`, `seed`, and
 * `iterations`, keeping the loop pure and deterministic.
 */
export interface TunerRequest {
  /** The originating prompt (provenance only; does not affect the loop). */
  prompt?: string;
  /**
   * The starting candidate — typically the provider's one-shot guess. Required:
   * this pure module never fabricates a seed (Req 9.5, handled in task 8.5).
   */
  seed: Candidate;
  /**
   * The pure, deterministic objective scorer, HIGHER IS BETTER. In real wiring
   * this is `(candidate) => scoreCandidate(objective, candidate)`.
   */
  evaluate: (candidate: Candidate) => number;
  /**
   * How many optimization iterations to run. Clamped to a floor of 2 so the
   * tuner always performs at least two evaluation iterations (Req 9.2).
   */
  iterations?: number;
}

/** The tuner's result: the best-scoring, fully in-range parameter set. */
export interface TunerResult {
  /** The best candidate found, coerced to a complete, in-range LabParams. */
  params: LabParams;
  /** The objective score of `params` (as produced by `evaluate`). */
  score: number;
  /** The score of the seed candidate, for `score >= seedScore` verification. */
  seedScore: number;
  /** How many candidate evaluations were performed (always `>= 2`). */
  evaluations: number;
}

/** The minimum number of iterations the tuner is allowed to run (Req 9.2). */
const MIN_ITERATIONS = 2;

/**
 * The numeric LabParams knobs the tuner is allowed to nudge, each paired with a
 * step scale appropriate to its magnitude. These are exactly the fields the
 * scoring objective reads (see `describe` in `objective.ts`): the energy /
 * turbulence / brightness / density drivers. Non-numeric fields (enums,
 * booleans, strings, colors) are left untouched by the search — flipping a mode
 * on/off is a discrete decision the one-shot provider makes, not something a
 * smooth coordinate-descent hill-climb should toggle.
 *
 * Steps are read as +/- deltas; `labParamsSchema` clamps every produced value
 * to its valid range, so an over-large step can never push a param out of range.
 */
const TUNABLE_STEPS: ReadonlyArray<readonly [keyof LabParams, number]> = [
  ["gravityX", 0.5],
  ["gravityY", 0.5],
  ["drag", 0.02],
  ["forceStrength", 0.5],
  ["nbodyG", 0.01],
  ["flowStrength", 0.5],
  ["flockSep", 0.3],
  ["flockCoh", 0.2],
  ["sphCohesion", 0.1],
  ["bloomStrength", 0.5],
  ["pointSize", 0.5],
  ["trailLength", 0.1],
];

/**
 * Coerce a candidate to a complete, in-range LabParams by merging it over
 * DEFAULT_PARAMS and running it through `labParamsSchema` (Req 9.4; Property 9).
 * `.catch()` on every schema field guarantees this never throws and always
 * yields a valid LabParams, so the tuner's output is always simulator-ready.
 */
function clampParams(candidate: Candidate): LabParams {
  return labParamsSchema.parse({ ...DEFAULT_PARAMS, ...candidate });
}

/**
 * The current numeric value of a tunable field, read from the candidate or its
 * DEFAULT_PARAMS fallback. All tunable fields are numeric by construction of
 * TUNABLE_STEPS, so this is always a finite number after the default fallback.
 */
function numAt(candidate: Candidate, key: keyof LabParams): number {
  const raw = (candidate[key] ?? DEFAULT_PARAMS[key]) as unknown;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Run the closed-loop tuner (Req 9). Deterministic and pure over the injected
 * `evaluate`: the same `(seed, evaluate, iterations)` always yields the same
 * result.
 *
 * The search is a bounded coordinate descent: each iteration tries a `+step` and
 * a `-step` nudge on every tunable numeric parameter (scored on the CLAMPED
 * candidate so the objective always sees an in-range value) and moves to the
 * best neighbour when it strictly improves the score. The seed is always the
 * initial best, so the returned score is `>=` the seed's score (Req 9.3); when
 * no neighbour improves, the seed is returned unchanged (design Property 8).
 * At least two iterations run regardless of the requested count (Req 9.2).
 */
export function runTuner(request: TunerRequest): TunerResult {
  const { seed, evaluate } = request;

  // At least two iterations (Req 9.2). A non-finite/omitted count floors to 2.
  const requested = Number(request.iterations);
  const iterations = Math.max(
    MIN_ITERATIONS,
    Number.isFinite(requested) ? Math.floor(requested) : MIN_ITERATIONS,
  );

  // The seed is the initial best-so-far. Scoring the CLAMPED candidate keeps the
  // objective consistent with what will ultimately be returned (Req 9.4).
  const seedScore = evaluate(clampParams(seed));

  let best: Candidate = { ...seed };
  let bestScore = seedScore;
  let evaluations = 1;

  for (let iter = 0; iter < iterations; iter++) {
    let improvedThisPass = false;

    // Coordinate descent: try each tunable knob in both directions, adopt the
    // first strict improvement per knob, and carry it into the next knob's search.
    for (const [key, step] of TUNABLE_STEPS) {
      const current = numAt(best, key);

      for (const delta of [step, -step]) {
        const neighbour: Candidate = { ...best, [key]: current + delta };
        const score = evaluate(clampParams(neighbour));
        evaluations += 1;

        // Strictly-greater keeps the search deterministic and monotonic and
        // guarantees we never move to a worse-or-equal candidate — so the best
        // (and thus the return value) is never worse than the seed (Req 9.3).
        if (score > bestScore) {
          best = neighbour;
          bestScore = score;
          improvedThisPass = true;
        }
      }
    }

    // Converged: another identical pass would find nothing new — stop early to
    // keep the loop bounded. Only allowed AFTER the >= 2 iteration floor has
    // been met, so the tuner always performs at least two passes (Req 9.2).
    if (!improvedThisPass && iter + 1 >= MIN_ITERATIONS) break;
  }

  return {
    // Clamp the winning candidate one final time so the returned params are
    // guaranteed in-range (Req 9.4; Property 9).
    params: clampParams(best),
    score: bestScore,
    seedScore,
    evaluations,
  };
}
