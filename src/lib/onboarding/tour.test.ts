import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { newMemoryKv, setKvStore } from "../platform/storage.ts";
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
} from "./tour.ts";

describe("tour steps", () => {
  it("has the three onboarding targets in order", () => {
    assert.deepEqual(
      TOUR_STEPS.map((s) => s.target),
      ["generators", "tools", "count"],
    );
  });

  it("every step has copy", () => {
    for (const s of TOUR_STEPS) {
      assert.ok(s.title.length > 0);
      assert.ok(s.body.length > 0);
    }
  });
});

describe("tour state machine (pure)", () => {
  it("starts inactive", () => {
    assert.equal(TOUR_INACTIVE.status, "inactive");
  });

  it("startTour opens at the first step", () => {
    const s = startTour();
    assert.deepEqual(s, { status: "active", index: 0 });
    assert.equal(currentStep(s)?.target, "generators");
  });

  it("nextStep advances then completes after the last step", () => {
    let s: TourState = startTour();
    assert.equal(isLastStep(s), false);
    s = nextStep(s); // -> tools
    assert.equal(currentStep(s)?.target, "tools");
    s = nextStep(s); // -> count (last)
    assert.equal(currentStep(s)?.target, "count");
    assert.equal(isLastStep(s), true);
    s = nextStep(s); // -> done
    assert.equal(s.status, "done");
    assert.equal(currentStep(s), null);
  });

  it("prevStep goes back and clamps at the first step", () => {
    let s: TourState = nextStep(startTour()); // tools
    s = prevStep(s); // generators
    assert.deepEqual(s, { status: "active", index: 0 });
    s = prevStep(s); // clamped
    assert.deepEqual(s, { status: "active", index: 0 });
  });

  it("skipTour ends the tour immediately", () => {
    assert.equal(skipTour().status, "done");
  });

  it("advancing an inactive/done state is a no-op", () => {
    assert.equal(nextStep(TOUR_INACTIVE).status, "inactive");
    assert.equal(nextStep({ status: "done" }).status, "done");
    assert.equal(prevStep({ status: "done" }).status, "done");
  });
});

describe("tour seen flag (localStorage-backed)", () => {
  beforeEach(() => setKvStore(newMemoryKv()));

  it("is unseen by default and set after markTourSeen", () => {
    assert.equal(hasSeenTour(), false);
    markTourSeen();
    assert.equal(hasSeenTour(), true);
  });
});
