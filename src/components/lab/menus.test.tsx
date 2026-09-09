import { afterEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { GeneratorBar } from "./menus";
import { useLab } from "@/store/lab-store";
import { SCENES } from "@/engine/scenes";
import { mount } from "./test-render";

// GeneratorBar renders the generator/effect/scene chips inline and drives the
// real lab store. These are real render tests (no engine/canvas/WebGPU needed):
// GeneratorBar only reads the zustand store and pure engine metadata. They also
// guard the ScenesBar removal — the scene chips must still render and apply
// scenes exactly as before now that the dead ScenesBar component is gone.

afterEach(() => {
  vi.restoreAllMocks();
});

function clickChipByText(container: HTMLElement, label: string): void {
  const chip = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!chip) throw new Error(`chip not found: ${label}`);
  act(() => {
    chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("GeneratorBar", () => {
  test("renders a chip for every scene (scenes UI survives ScenesBar removal)", () => {
    const { container, unmount } = mount(<GeneratorBar />);
    try {
      const labels = [...container.querySelectorAll("button")].map((b) => b.textContent?.trim());
      for (const scene of SCENES) {
        expect(labels).toContain(scene.label);
      }
    } finally {
      unmount();
    }
  });

  test("clicking a scene chip applies that scene through the store", () => {
    // Reset any scene the store might carry from another test.
    act(() => useLab.setState({ activeSceneId: null }));
    // Use a scene whose label does not collide with a generator/effect chip
    // label (e.g. "Black Hole" exists as both an effect and a scene).
    const scene = SCENES.find((s) => s.id === "murmuration")!;
    const { container, unmount } = mount(<GeneratorBar />);
    try {
      expect(useLab.getState().activeSceneId).toBe(null);
      clickChipByText(container, scene.label);
      expect(useLab.getState().activeSceneId).toBe(scene.id);
    } finally {
      unmount();
    }
  });

  test("clicking a free generator chip runs the generator (bumps spawnId)", () => {
    act(() => useLab.setState({ entitled: false, upgradeOpen: false }));
    const before = useLab.getState().spawnId;
    const { container, unmount } = mount(<GeneratorBar />);
    try {
      clickChipByText(container, "Galaxy");
      const s = useLab.getState();
      expect(s.spawnId).toBe(before + 1);
      expect(s.spawnKind).toBe("galaxy");
      expect(s.upgradeOpen).toBe(false);
    } finally {
      unmount();
    }
  });

  test("clicking a locked pro chip opens the upgrade dialog instead of running", () => {
    act(() => useLab.setState({ entitled: false, upgradeOpen: false }));
    const before = useLab.getState().spawnId;
    const { container, unmount } = mount(<GeneratorBar />);
    try {
      // "Crystal" is a pro effect; with entitled=false it must gate to upgrade
      // rather than spawning.
      clickChipByText(container, "Crystal");
      const s = useLab.getState();
      expect(s.upgradeOpen).toBe(true);
      expect(s.spawnId).toBe(before);
    } finally {
      unmount();
      act(() => useLab.setState({ upgradeOpen: false }));
    }
  });
});
