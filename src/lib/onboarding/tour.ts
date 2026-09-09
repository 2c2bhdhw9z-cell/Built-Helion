/**
 * First-run onboarding tour (Item 14) — pure sequence logic + "seen" flag.
 *
 * The visual highlight (positioning a spotlight over a DOM target) lives in the
 * React component; everything decidable WITHOUT a DOM is here so it can be
 * unit-tested: the ordered step list, the advance / back / skip / complete state
 * machine, and the localStorage "seen" flag so a returning user is never
 * re-prompted.
 */
import { kv } from "../platform/storage.ts";

/** A single tour step. `target` is a data-tour attribute value to spotlight. */
export type TourStep = {
  id: string;
  target: string;
  title: string;
  body: string;
};

/**
 * The three things a new user needs (in order): the generator bar (make
 * something), the tools (interact with it), and the Count/cap slider (control
 * how much). Kept short per the brief.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "generators",
    target: "generators",
    title: "Generate a scene",
    body: "Tap a generator to fill the stage with particles — a galaxy, a burst, fireworks, and more.",
  },
  {
    id: "tools",
    target: "tools",
    title: "Play with it",
    body: "Pick a tool, then drag on the sim to attract, repel, swirl, paint, or freeze the particles.",
  },
  {
    id: "count",
    target: "count",
    title: "Control the count",
    body: "Slide Count to set how many particles spawn. Push it up for a denser, richer scene.",
  },
];

const SEEN_KEY = "helion.tourSeen";

/** Whether the first-run tour has already been seen (persisted). Safe on SSR. */
export function hasSeenTour(): boolean {
  try {
    return kv().get(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist that the tour has been seen so it never auto-opens again. */
export function markTourSeen(): void {
  try {
    kv().set(SEEN_KEY, "1");
  } catch {
    /* quota / private mode — degrade silently */
  }
}

export type TourState =
  | { status: "inactive" }
  | { status: "active"; index: number }
  | { status: "done" };

export const TOUR_INACTIVE: TourState = { status: "inactive" };

/** Start the tour at the first step. */
export function startTour(): TourState {
  return { status: "active", index: 0 };
}

/**
 * Advance to the next step; completing the last step transitions to "done".
 * A no-op when not active.
 */
export function nextStep(state: TourState, steps: TourStep[] = TOUR_STEPS): TourState {
  if (state.status !== "active") return state;
  const next = state.index + 1;
  if (next >= steps.length) return { status: "done" };
  return { status: "active", index: next };
}

/** Go back one step; clamped at the first step. A no-op when not active. */
export function prevStep(state: TourState): TourState {
  if (state.status !== "active") return state;
  return { status: "active", index: Math.max(0, state.index - 1) };
}

/** Skip the whole tour (Skip button). Ends without completing further steps. */
export function skipTour(): TourState {
  return { status: "done" };
}

/** True on the last step, so the UI shows "Done" instead of "Next". */
export function isLastStep(state: TourState, steps: TourStep[] = TOUR_STEPS): boolean {
  return state.status === "active" && state.index === steps.length - 1;
}

/** The current step object, or null when the tour is not showing a step. */
export function currentStep(state: TourState, steps: TourStep[] = TOUR_STEPS): TourStep | null {
  if (state.status !== "active") return null;
  return steps[state.index] ?? null;
}
