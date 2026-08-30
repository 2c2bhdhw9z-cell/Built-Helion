import { create } from "zustand";
import {
  DEFAULT_CAP,
  DEFAULT_PARAMS,
  DEFAULT_TELEMETRY,
  type GeneratorKind,
  type LabParams,
  type ParamTab,
  type PointerState,
  type Telemetry,
  type ToolKind,
} from "@/engine/types";
import { SCENES, type SceneId } from "@/engine/scenes";
import type { CreationConfig } from "@/lib/creations/types";

export type SpeedMul = 0.25 | 0.5 | 1 | 2 | 4;

/** Live engine rendering-context snapshot exposed to the perf hub (see engine.getSystemInfo). */
export type EngineSystemInfo = {
  backend: string;
  compute: string;
  dpr: number;
  cssW: number;
  cssH: number;
  backingW: number;
  backingH: number;
  gl: WebGL2RenderingContext | null;
};

type LabState = {
  params: LabParams;
  telemetry: Telemetry;
  paused: boolean;
  speed: SpeedMul;
  cap: number;
  tool: ToolKind;
  brushRadius: number;
  brushStrength: number;
  pointer: PointerState;
  replaceMode: boolean;
  spawnCount: number;
  pouring: boolean;
  falling: boolean;
  tab: ParamTab;
  uiTopOpen: boolean;
  uiBottomOpen: boolean;
  feedbackOpen: boolean;
  boardOpen: boolean;
  perfHubOpen: boolean;
  perfCompact: boolean;
  /**
   * Lazily-populated reader for live engine system/GL info. Set by CanvasStage
   * once the engine is running; the perf hub calls it (only while open) to read
   * backend/compute/DPR/canvas resolution + the raw gl context for GPU vendor.
   * Null until the engine mounts (hub then shows values as unavailable).
   */
  getEngineSystemInfo: null | (() => EngineSystemInfo);
  tiltX: number;
  tiltY: number;
  spawnId: number;
  spawnKind: GeneratorKind | null;
  clearId: number;
  /** Id of the most recently applied scene, or null. Purely informational for the picker. */
  activeSceneId: SceneId | null;
  setParam: <K extends keyof LabParams>(key: K, value: LabParams[K]) => void;
  patchParams: (p: Partial<LabParams>) => void;
  setTelemetry: (t: Telemetry) => void;
  setPaused: (v: boolean) => void;
  setSpeed: (v: SpeedMul) => void;
  setCap: (v: number) => void;
  setTool: (t: ToolKind) => void;
  setBrush: (radius: number, strength: number) => void;
  setPointer: (p: Partial<PointerState>) => void;
  setReplace: (v: boolean) => void;
  setSpawnCount: (n: number) => void;
  addParticles: () => void;
  setTab: (t: ParamTab) => void;
  toggleUiTop: () => void;
  toggleUiBottom: () => void;
  setFeedbackOpen: (v: boolean) => void;
  setBoardOpen: (v: boolean) => void;
  setPerfHubOpen: (v: boolean) => void;
  setPerfCompact: (v: boolean) => void;
  setEngineSystemInfo: (fn: null | (() => EngineSystemInfo)) => void;
  setTilt: (x: number, y: number) => void;
  runGenerator: (kind: GeneratorKind) => void;
  applyScene: (id: SceneId) => void;
  /**
   * Load a saved creation's config into the sim using the same deterministic
   * clean-apply as `applyScene` (clear first, reset params over DEFAULT_PARAMS,
   * set spawn kind/count/speed, bump spawnId).
   *
   * SECURITY: `config` is assumed to already be a VALIDATED CreationConfig.
   * Callers that load an untrusted payload (a DB jsonb value or a public
   * share-link blob) MUST run it through `normalizeCreationConfig` (from
   * @/lib/creations/types) FIRST — that whitelists known keys, coerces invalid
   * values to defaults, and returns null on total garbage so the caller can
   * fall back to the default sim. `applyCreationConfig` performs no validation.
   */
  applyCreationConfig: (config: CreationConfig) => void;
  clearSim: () => void;
};

/**
 * Snapshot the current sim into a savable CreationConfig. Pure and derivable
 * from a LabState slice so both the Save UI and unit tests can use it without
 * React. `spawnKind` falls back to 'galaxy' when null, matching the store's
 * existing fallbacks in addParticles/runGenerator.
 */
export function currentCreationConfig(
  state: Pick<LabState, "params" | "spawnKind" | "spawnCount" | "speed">,
): CreationConfig {
  return {
    params: { ...state.params },
    spawnKind: state.spawnKind ?? "galaxy",
    spawnCount: state.spawnCount,
    speed: state.speed,
  };
}

export const useLab = create<LabState>((set, get) => ({
  params: { ...DEFAULT_PARAMS },
  telemetry: { ...DEFAULT_TELEMETRY, cap: DEFAULT_CAP },
  paused: false,
  speed: 1,
  cap: DEFAULT_CAP,
  tool: "attract",
  brushRadius: 0.12,
  brushStrength: 0.85,
  pointer: { x: 0.5, y: 0.5, down: false, inside: false },
  replaceMode: true,
  spawnCount: 5000,
  pouring: false,
  falling: false,
  tab: "physics",
  uiTopOpen: true,
  uiBottomOpen: true,
  feedbackOpen: false,
  boardOpen: false,
  perfHubOpen: false,
  perfCompact: false,
  getEngineSystemInfo: null,
  tiltX: 0,
  tiltY: 0,
  spawnId: 0,
  spawnKind: "galaxy",
  clearId: 0,
  activeSceneId: null,
  // Manual param edits mean the sim no longer matches any applied scene, so
  // clear activeSceneId to keep the Scenes picker highlight honest.
  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value }, activeSceneId: null })),
  patchParams: (p) => set((s) => ({ params: { ...s.params, ...p }, activeSceneId: null })),
  setTelemetry: (t) => set({ telemetry: t }),
  setPaused: (v) => set({ paused: v }),
  setSpeed: (v) => set({ speed: v }),
  setCap: (v) => set({ cap: v }),
  setTool: (t) => set({ tool: t }),
  setBrush: (radius, strength) => set({ brushRadius: radius, brushStrength: strength }),
  setPointer: (p) => set((s) => ({ pointer: { ...s.pointer, ...p } })),
  setReplace: (v) => set({ replaceMode: v }),
  setSpawnCount: (n) => set({ spawnCount: Math.max(50, Math.min(200_000, Math.round(n))) }),
  addParticles: () =>
    set((s) => ({
      replaceMode: false,
      spawnId: s.spawnId + 1,
      spawnKind: s.spawnKind ?? "galaxy",
    })),
  setTab: (t) => set({ tab: t }),
  toggleUiTop: () => set((s) => ({ uiTopOpen: !s.uiTopOpen })),
  toggleUiBottom: () => set((s) => ({ uiBottomOpen: !s.uiBottomOpen })),
  setFeedbackOpen: (v) => set({ feedbackOpen: v }),
  setBoardOpen: (v) => set({ boardOpen: v }),
  setPerfHubOpen: (v) => set({ perfHubOpen: v }),
  setPerfCompact: (v) => set({ perfCompact: v }),
  setEngineSystemInfo: (fn) => set({ getEngineSystemInfo: fn }),
  setTilt: (x, y) => set({ tiltX: x, tiltY: y }),
  runGenerator: (kind) => {
    const patch: Partial<LabParams> = {
      flock: kind === "flock",
      nbody: kind === "nbody",
      sph: false,
      settle: kind === "cloth",
      gravityY: kind === "cloth" || kind === "pour" || kind === "fall" ? 0.85 : 0,
      gravityX: 0,
      centralMass: kind === "galaxy" || kind === "ring" ? 1.35 : 0,
      collide: kind === "cloth" ? false : get().params.collide,
      blend: kind === "cloth" || kind === "flock" || kind === "galaxy" || kind === "ring" ? "alpha" : get().params.blend,
      colorMap: kind === "cloth" ? "mass" : kind === "nbody" || kind === "burst" ? "speed" : "palette",
      palette:
        kind === "galaxy" || kind === "ring" || kind === "pour" || kind === "fall"
          ? "rainbow"
          : kind === "flock"
            ? "aurora"
            : kind === "nbody"
              ? "ice"
              : kind === "cloth"
                ? "mono"
                : kind === "burst"
                  ? "solar"
                  : get().params.palette,
      trails: kind === "cloth" ? false : kind === "burst" ? true : get().params.trails,
      drag: kind === "galaxy" || kind === "ring" ? 0.03 : kind === "flock" ? 0.04 : kind === "cloth" ? 0.22 : 0.12,
    };
    set((s) => ({
      params: { ...s.params, ...patch },
      pouring: kind === "pour" ? !s.pouring : false,
      falling: kind === "fall" ? !s.falling : false,
      replaceMode: true,
      spawnId: kind === "pour" || kind === "fall" ? s.spawnId : s.spawnId + 1,
      spawnKind: kind === "pour" || kind === "fall" ? s.spawnKind : kind,
      // Switching generators diverges from any applied scene.
      activeSceneId: null,
    }));
  },
  applyScene: (id) => {
    const scene = SCENES.find((s) => s.id === id);
    if (!scene) return;
    // Layer the scene patch over a fresh DEFAULT_PARAMS baseline so stale toggles
    // from a previously applied scene are reset to defaults, not carried over.
    const nextParams: LabParams = { ...DEFAULT_PARAMS, ...scene.params };
    // Same clamp as setSpawnCount.
    const nextSpawnCount = Math.max(50, Math.min(200_000, Math.round(scene.spawnCount)));
    set((s) => ({
      // Clear first so scenes never stack on top of the previous one.
      clearId: s.clearId + 1,
      params: nextParams,
      spawnCount: nextSpawnCount,
      speed: scene.speed ?? s.speed,
      cap: scene.cap ?? s.cap,
      pouring: false,
      // Deterministic: falling is a definite boolean from the scene (default off),
      // never a toggle. Only the waterfall scene opts into continuous emission.
      falling: scene.falling === true,
      replaceMode: true,
      spawnKind: scene.kind,
      spawnId: s.spawnId + 1,
      activeSceneId: scene.id,
    }));
  },
  // Load a saved creation. Mirrors applyScene's deterministic clean-apply so a
  // loaded creation reproduces the saved look regardless of prior sim state.
  // `config` MUST already be a validated CreationConfig (see the type-level
  // note above / normalizeCreationConfig for untrusted share-link payloads).
  applyCreationConfig: (config) => {
    // Layer over a fresh DEFAULT_PARAMS baseline so stale toggles never leak.
    const nextParams: LabParams = { ...DEFAULT_PARAMS, ...config.params };
    // Same clamp as setSpawnCount/applyScene.
    const nextSpawnCount = Math.max(50, Math.min(200_000, Math.round(config.spawnCount)));
    set((s) => ({
      // Clear first so a loaded creation never stacks on the previous sim.
      clearId: s.clearId + 1,
      params: nextParams,
      spawnCount: nextSpawnCount,
      speed: config.speed,
      pouring: false,
      // Deterministic boolean (default off); only 'fall' streams continuously.
      falling: config.spawnKind === "fall",
      replaceMode: true,
      // creationConfigSchema only ever produces a valid GeneratorKind here; the
      // zod .catch()/.default() on the enum widens the inferred type to string.
      spawnKind: config.spawnKind as GeneratorKind,
      spawnId: s.spawnId + 1,
      // A loaded creation is not one of the curated scenes.
      activeSceneId: null,
    }));
  },
  clearSim: () =>
    set((s) => ({
      clearId: s.clearId + 1,
      pouring: false,
      falling: false,
      // A manual clear leaves the sim no longer matching the applied scene.
      activeSceneId: null,
    })),
}));
