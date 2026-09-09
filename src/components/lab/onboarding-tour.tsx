import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import {
  currentStep,
  hasSeenTour,
  isLastStep,
  markTourSeen,
  nextStep,
  prevStep,
  skipTour,
  startTour,
  TOUR_INACTIVE,
  TOUR_STEPS,
  type TourState,
} from "@/lib/onboarding/tour";

/**
 * First-run onboarding tour (Item 14). A lightweight spotlight sequence over the
 * three things a new user needs: the generator bar, the tools, and the Count
 * slider. It auto-opens ONCE (persisted via hasSeenTour/markTourSeen), and is
 * re-launchable any time from the command palette / help — the store `tourOpen`
 * flag drives that.
 *
 * All decidable logic (step order, advance/back/skip/complete, the "seen" flag)
 * lives in and is unit-tested from src/lib/onboarding/tour.ts; this component
 * only renders the spotlight rect + copy card, which is reasoned about (it needs
 * live DOM layout, so it is not headlessly tested).
 */

type Rect = { top: number; left: number; width: number; height: number };

function targetRect(target: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function OnboardingTour() {
  const tourOpen = useLab((s) => s.tourOpen);
  const setTourOpen = useLab((s) => s.setTourOpen);
  const [state, setState] = useState<TourState>(TOUR_INACTIVE);
  const [rect, setRect] = useState<Rect | null>(null);

  // Auto-open once for a first-time visitor. Delayed a beat so the chrome has
  // laid out and the data-tour targets exist to spotlight.
  useEffect(() => {
    if (hasSeenTour()) return;
    const id = window.setTimeout(() => {
      if (!hasSeenTour()) useLab.getState().setTourOpen(true);
    }, 900);
    return () => window.clearTimeout(id);
  }, []);

  // Sync local step machine with the store open flag: opening (re)starts at the
  // first step; closing resets to inactive.
  useEffect(() => {
    setState(tourOpen ? startTour() : TOUR_INACTIVE);
  }, [tourOpen]);

  const step = currentStep(state, TOUR_STEPS);

  // Measure the current target and keep the spotlight aligned on resize/scroll.
  useLayoutEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    const measure = () => setRect(targetRect(step.target));
    measure();
    // A second measure on the next frame catches late layout (fonts, docks).
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  const finish = useCallback(() => {
    markTourSeen();
    setTourOpen(false);
  }, [setTourOpen]);

  const onNext = useCallback(() => {
    setState((s) => {
      const advanced = nextStep(s, TOUR_STEPS);
      if (advanced.status === "done") finish();
      return advanced;
    });
  }, [finish]);

  const onSkip = useCallback(() => {
    setState(skipTour());
    finish();
  }, [finish]);

  useEffect(() => {
    if (!tourOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourOpen, onSkip]);

  if (!tourOpen || !step) return null;

  const pad = 8;
  const spot = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Place the copy card below the spotlight if there's room, else above.
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  const cardBelow = spot ? spot.top + spot.height < vh * 0.6 : true;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Welcome tour">
      {/* Dimmed backdrop with a bright ring around the spotlighted target. */}
      <div className="absolute inset-0 bg-black/60" onClick={onSkip} aria-hidden />
      {spot ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-accent transition-[top,left,width,height] duration-200"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
          aria-hidden
        />
      ) : null}

      <div
        className="absolute w-[min(92vw,20rem)] rounded-lg border border-border bg-surface p-4 text-fg shadow-xl"
        style={
          spot
            ? {
                left: Math.min(Math.max(12, spot.left), (typeof window !== "undefined" ? window.innerWidth : 360) - 320 - 12),
                top: cardBelow ? spot.top + spot.height + 12 : undefined,
                bottom: cardBelow ? undefined : Math.max(12, vh - spot.top + 12),
              }
            : { left: "50%", top: "50%", transform: "translate(-50%,-50%)" }
        }
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-2xs uppercase tracking-[0.16em] text-faint">
            Step {state.status === "active" ? state.index + 1 : 1} of {TOUR_STEPS.length}
          </p>
          <button
            type="button"
            onClick={onSkip}
            className="text-2xs text-faint hover:text-fg"
          >
            Skip
          </button>
        </div>
        <h2 className="text-sm font-medium">{step.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={state.status !== "active" || state.index === 0}
            onClick={() => setState((s) => prevStep(s))}
          >
            Back
          </Button>
          <Button variant="default" size="sm" className="h-8" onClick={onNext}>
            {isLastStep(state, TOUR_STEPS) ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
