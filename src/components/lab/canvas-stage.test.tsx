import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "./test-render";
import { useLab } from "@/store/lab-store";

// CanvasStage hard-depends on a real ParticleEngine (WebGL/WebGPU + a live
// canvas), which happy-dom cannot provide, so a "real" render of the engine is
// not headlessly testable. We DO test the component-specific wiring that a
// re-render bug would break: the mount-only effect that registers the capture
// handlers (screenshot / record / GIF) on the store EXACTLY once. That effect
// has an intentionally-empty dep array with an eslint-disable — this guards
// that the handlers are registered on mount, cleared on unmount, and not
// thrashed by re-renders.

const startWorldScale = vi.fn();
const disposeSpy = vi.fn();

vi.mock("@/engine/engine", () => {
  class ParticleEngine {
    walls: unknown[] = [];
    worldH = 1;
    worldScale = 1;
    canvas: unknown;
    constructor(canvas: unknown) {
      this.canvas = canvas;
    }
    setWorldScale = startWorldScale;
    getSystemInfo = () => ({});
    start = () => Promise.resolve();
    resize = vi.fn();
    spawn = vi.fn();
    spawnSamples = vi.fn();
    setSprite = vi.fn();
    setOrbit = vi.fn();
    sync = vi.fn();
    stepFrame = vi.fn();
    requestScreenshot = () => Promise.resolve();
    clear = vi.fn();
    clearWalls = vi.fn();
    setForceField = vi.fn();
    clearForceField = vi.fn();
    field = null;
    hasFieldPaint = false;
    tool = "attract";
    timelinePlaying = false;
    timelinePlayhead = 0;
    dispose = disposeSpy;
  }
  return { ParticleEngine };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  class RO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("ResizeObserver", RO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadCanvasStage() {
  return (await import("./canvas-stage")).CanvasStage;
}

describe("CanvasStage capture-handler registration", () => {
  test("registers the capture handlers on the store at mount", async () => {
    const CanvasStage = await loadCanvasStage();
    const { unmount } = mount(<CanvasStage />);
    try {
      const s = useLab.getState();
      expect(typeof s.startGif).toBe("function");
      expect(typeof s.stopGif).toBe("function");
      expect(typeof s.startRecording).toBe("function");
      expect(typeof s.captureScreenshot).toBe("function");
      expect(typeof s.getEngineSystemInfo).toBe("function");
    } finally {
      unmount();
    }
  });

  test("clears the handlers on unmount", async () => {
    const CanvasStage = await loadCanvasStage();
    const { unmount } = mount(<CanvasStage />);
    unmount();
    const s = useLab.getState();
    expect(s.startGif).toBe(null);
    expect(s.stopGif).toBe(null);
    expect(s.startRecording).toBe(null);
    expect(s.captureScreenshot).toBe(null);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  test("does not re-run the mount effect (re-instantiate the engine) on re-render", async () => {
    const CanvasStage = await loadCanvasStage();
    const { rerender, unmount } = mount(<CanvasStage />);
    try {
      // The mount-only effect ran once; capture the registered handlers.
      const gif = useLab.getState().startGif;
      const screenshot = useLab.getState().captureScreenshot;
      rerender(<CanvasStage />);
      rerender(<CanvasStage />);
      // No teardown/rebuild: the engine is not disposed and re-created (which
      // is what would happen if the mount effect re-ran), and the registered
      // handler references are unchanged.
      expect(disposeSpy).not.toHaveBeenCalled();
      expect(useLab.getState().startGif).toBe(gif);
      expect(useLab.getState().captureScreenshot).toBe(screenshot);
    } finally {
      unmount();
    }
  });
});
