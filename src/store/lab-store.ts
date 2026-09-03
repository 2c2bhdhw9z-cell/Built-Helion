import { create } from "zustand";
import {
  DEFAULT_CAP,
  DEFAULT_PARAMS,
  DEFAULT_TELEMETRY,
  QUALITY_CAPS,
  isProGenerator,
  type GeneratorKind,
  type LabParams,
  type ParamTab,
  type PointerState,
  type QualityMode,
  type Telemetry,
  type ToolKind,
} from "@/engine/types";
import { GENERATOR_PRESETS } from "@/engine/generator-presets";
import { SCENES, type SceneId } from "@/engine/scenes";
import type { CreationConfig } from "@/lib/creations/types";
import { canRecord as canRecordCapability } from "@/lib/capture/mime";

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
  firing: boolean;
  smoking: boolean;
  tab: ParamTab;
  uiTopOpen: boolean;
  uiBottomOpen: boolean;
  feedbackOpen: boolean;
  boardOpen: boolean;
  creationsOpen: boolean;
  libraryOpen: boolean;
  profileOpen: boolean;
  upgradeOpen: boolean;
  /** True when the signed-in plan or active trial unlocks Pro generators / 4K. */
  entitled: boolean;
  perfHubOpen: boolean;
  perfCompact: boolean;
  helpOpen: boolean;
  viewZoom: number;
  viewPanX: number;
  viewPanY: number;
  viewRotate: number;
  /** Session-only object URL for an image/video backdrop. Not persisted. */
  bgObjectUrl: string | null;
  quality: QualityMode;
  /**
   * Lazily-populated reader for live engine system/GL info. Set by CanvasStage
   * once the engine is running; the perf hub calls it (only while open) to read
   * backend/compute/DPR/canvas resolution + the raw gl context for GPU vendor.
   * Null until the engine mounts (hub then shows values as unavailable).
   */
  getEngineSystemInfo: null | (() => EngineSystemInfo);
  /**
   * Trigger a screenshot of the sim (engine canvas + walls overlay, composited
   * and downloaded as PNG or JPG). Set by CanvasStage once the engine is running
   * and cleared on unmount; the HUD export menu calls it. Null until the engine
   * mounts (button then no-ops). NEVER gated on auth — capture works for anyone.
   */
  captureScreenshot: ((kind?: "png" | "jpg") => void) | null;
  /**
   * Start recording the sim to a video. Set by CanvasStage once the engine is
   * running and cleared on unmount; the HUD record button calls it. Null until
   * the engine mounts (button then no-ops). NEVER gated on auth. The HUD should
   * only surface this when `canRecord` is true.
   */
  startRecording: (() => void) | null;
  /**
   * Stop the in-progress recording and trigger the video download. Set/cleared
   * by CanvasStage alongside startRecording. Null until the engine mounts.
   */
  stopRecording: (() => void) | null;
  /**
   * Start/stop a short looping GIF capture of the sim. Independent of video
   * recording so a phone without MediaRecorder can still export motion.
   */
  startGif: (() => void) | null;
  stopGif: (() => void) | null;
  gifRecording: boolean;
  /**
   * Whether a recording is currently active. Kept in sync by CanvasStage so the
   * HUD can toggle the record button label/icon (Record vs Stop) and show it as
   * active.
   */
  recording: boolean;
  /**
   * Whether this environment can record a canvas to video (MediaRecorder +
   * canvas.captureStream + a supported webm/mp4 mime). Computed ONCE at store
   * creation via the capture module's feature detection so the HUD can
   * disable/hide the record button (with an explanatory tooltip) instead of the
   * recorder throwing. Expected false on many iOS Safari versions.
   */
  canRecord: boolean;
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
  setCreationsOpen: (v: boolean) => void;
  setLibraryOpen: (v: boolean) => void;
  setProfileOpen: (v: boolean) => void;
  setUpgradeOpen: (v: boolean) => void;
  setEntitled: (v: boolean) => void;
  setPerfHubOpen: (v: boolean) => void;
  setPerfCompact: (v: boolean) => void;
  setEngineSystemInfo: (fn: null | (() => EngineSystemInfo)) => void;
  setCaptureScreenshot: (fn: ((kind?: "png" | "jpg") => void) | null) => void;
  setStartRecording: (fn: (() => void) | null) => void;
  setStopRecording: (fn: (() => void) | null) => void;
  setRecording: (v: boolean) => void;
  setStartGif: (fn: (() => void) | null) => void;
  setStopGif: (fn: (() => void) | null) => void;
  setGifRecording: (v: boolean) => void;
  setTilt: (x: number, y: number) => void;
  setBgMedia: (url: string | null) => void;
  runGenerator: (kind: GeneratorKind) => void;
  applyScene: (id: SceneId) => void;
  applyCreationConfig: (config: CreationConfig) => void;
  clearSim: () => void;
  setHelpOpen: (v: boolean) => void;
  setView: (v: Partial<{ zoom: number; panX: number; panY: number; rotate: number }>) => void;
  resetView: () => void;
  setQuality: (q: QualityMode) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/**
 * Snapshot the current sim into a savable CreationConfig. Pure and derivable
 * from a LabState slice so both the Save UI and unit tests can use it without
 * React. `spawnKind` falls back to 'galaxy' when null, matching the store's
 * existing fallbacks in addParticles/runGenerator.
 */
export function currentCreationConfig(
  state: Pick<LabState, "params" | "spawnKind" | "spawnCount" | "speed" | "cap">,
): CreationConfig {
  return {
    params: { ...state.params },
    spawnKind: state.spawnKind ?? "galaxy",
    spawnCount: state.spawnCount,
    speed: state.speed,
    // Capture the buffer cap so a high-count creation reproduces at full
    // particle count on load (mirrors how applyScene persists scene.cap).
    cap: state.cap,
  };
}

const HISTORY_LIMIT = 24;

type HistorySnap = CreationConfig & {
  pouring: boolean;
  falling: boolean;
  firing: boolean;
  smoking: boolean;
};

function takeSnap(s: LabState): HistorySnap {
  return {
    ...currentCreationConfig(s),
    pouring: s.pouring,
    falling: s.falling,
    firing: s.firing,
    smoking: s.smoking,
  };
}

function applySnap(s: LabState, snap: HistorySnap) {
  const nextParams: LabParams = { ...DEFAULT_PARAMS, ...snap.params };
  const nextSpawnCount = Math.max(50, Math.min(200_000, Math.round(snap.spawnCount)));
  return {
    clearId: s.clearId + 1,
    params: nextParams,
    spawnCount: nextSpawnCount,
    cap: Math.max(snap.cap, nextSpawnCount),
    speed: snap.speed,
    pouring: snap.pouring,
    falling: snap.falling,
    firing: snap.firing,
    smoking: snap.smoking,
    replaceMode: true,
    spawnKind: snap.spawnKind as GeneratorKind,
    spawnId: s.spawnId + 1,
    activeSceneId: null,
  };
}

function revokeBg(url: string | null) {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

let past: HistorySnap[] = [];
let future: HistorySnap[] = [];

function pushHistory(s: LabState) {
  past.push(takeSnap(s));
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
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
  firing: false,
  smoking: false,
  tab: "physics",
  uiTopOpen: true,
  uiBottomOpen: true,
  feedbackOpen: false,
  boardOpen: false,
  creationsOpen: false,
  libraryOpen: false,
  profileOpen: false,
  upgradeOpen: false,
  entitled: false,
  perfHubOpen: false,
  perfCompact: false,
  helpOpen: false,
  viewZoom: 1,
  viewPanX: 0,
  viewPanY: 0,
  viewRotate: 0,
  bgObjectUrl: null,
  quality: "high",
  getEngineSystemInfo: null,
  captureScreenshot: null,
  startRecording: null,
  stopRecording: null,
  startGif: null,
  stopGif: null,
  gifRecording: false,
  recording: false,
  canRecord: canRecordCapability(),
  tiltX: 0,
  tiltY: 0,
  spawnId: 0,
  spawnKind: "galaxy",
  clearId: 0,
  activeSceneId: null,
  canUndo: false,
  canRedo: false,
  setParam: (key, value) => {
    set((s) => ({ params: { ...s.params, [key]: value }, activeSceneId: null }));
  },
  patchParams: (p) => {
    set((s) => ({ params: { ...s.params, ...p }, activeSceneId: null }));
  },
  setTelemetry: (t) => set({ telemetry: t }),
  setPaused: (v) => {
    set({ paused: v });
  },
  setSpeed: (v) => {
    set({ speed: v });
  },
  setCap: (v) => set({ cap: v }),
  setTool: (t) => {
    set({ tool: t });
  },
  setBrush: (radius, strength) => {
    set({ brushRadius: radius, brushStrength: strength });
  },
  setPointer: (p) => set((s) => ({ pointer: { ...s.pointer, ...p } })),
  setReplace: (v) => set({ replaceMode: v }),
  setSpawnCount: (n) => set({ spawnCount: Math.max(50, Math.min(200_000, Math.round(n))) }),
  addParticles: () => {
    set((s) => ({
      replaceMode: false,
      spawnId: s.spawnId + 1,
      spawnKind: s.spawnKind ?? "galaxy",
    }));
  },
  setTab: (t) => set({ tab: t }),
  toggleUiTop: () =>
    set((s) => ({ uiTopOpen: !s.uiTopOpen, helpOpen: s.uiTopOpen ? false : s.helpOpen })),
  toggleUiBottom: () => set((s) => ({ uiBottomOpen: !s.uiBottomOpen })),
  setFeedbackOpen: (v) => set({ feedbackOpen: v }),
  setBoardOpen: (v) => set({ boardOpen: v }),
  setCreationsOpen: (v) => set({ creationsOpen: v }),
  setLibraryOpen: (v) => set({ libraryOpen: v }),
  setProfileOpen: (v) => set({ profileOpen: v }),
  setUpgradeOpen: (v) => set({ upgradeOpen: v }),
  setEntitled: (v) => set({ entitled: v }),
  setPerfHubOpen: (v) => set({ perfHubOpen: v }),
  setPerfCompact: (v) => set({ perfCompact: v }),
  setHelpOpen: (v) => set({ helpOpen: v }),
  setEngineSystemInfo: (fn) => set({ getEngineSystemInfo: fn }),
  setCaptureScreenshot: (fn) => set({ captureScreenshot: fn }),
  setStartRecording: (fn) => set({ startRecording: fn }),
  setStopRecording: (fn) => set({ stopRecording: fn }),
  setRecording: (v) => set({ recording: v }),
  setStartGif: (fn) => set({ startGif: fn }),
  setStopGif: (fn) => set({ stopGif: fn }),
  setGifRecording: (v) => set({ gifRecording: v }),
  setTilt: (x, y) => set({ tiltX: x, tiltY: y }),
  setBgMedia: (url) => {
    const prev = get().bgObjectUrl;
    if (prev && prev !== url) revokeBg(prev);
    set({ bgObjectUrl: url });
  },
  setView: (v) =>
    set((s) => ({
      viewZoom: v.zoom !== undefined ? Math.min(8, Math.max(0.4, v.zoom)) : s.viewZoom,
      viewPanX: v.panX !== undefined ? v.panX : s.viewPanX,
      viewPanY: v.panY !== undefined ? v.panY : s.viewPanY,
      viewRotate:
        v.rotate !== undefined ? Math.min(180, Math.max(-180, v.rotate)) : s.viewRotate,
    })),
  resetView: () => set({ viewZoom: 1, viewPanX: 0, viewPanY: 0, viewRotate: 0 }),
  setQuality: (q) =>
    set(() => ({
      quality: q,
      cap: QUALITY_CAPS[q],
    })),
  runGenerator: (kind) => {
    if (isProGenerator(kind) && !get().entitled) {
      set({ upgradeOpen: true });
      return;
    }
    const patch = GENERATOR_PRESETS[kind] ?? {};
    const stream = kind === "pour" || kind === "fall" || kind === "fire" || kind === "smoke";
    const burst = kind !== "pour" && kind !== "fall";
    pushHistory(get());
    set((s) => ({
      params: { ...s.params, ...patch },
      pouring: kind === "pour" ? !s.pouring : false,
      falling: kind === "fall" ? !s.falling : false,
      firing: kind === "fire" ? !s.firing : false,
      smoking: kind === "smoke" ? !s.smoking : false,
      replaceMode: true,
      spawnId: burst || !stream ? s.spawnId + 1 : s.spawnId,
      spawnKind: stream && kind !== "fire" && kind !== "smoke" ? s.spawnKind : kind,
      activeSceneId: null,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  applyScene: (id) => {
    const scene = SCENES.find((s) => s.id === id);
    if (!scene) return;
    const nextParams: LabParams = { ...DEFAULT_PARAMS, ...scene.params };
    const nextSpawnCount = Math.max(50, Math.min(200_000, Math.round(scene.spawnCount)));
    pushHistory(get());
    set((s) => ({
      clearId: s.clearId + 1,
      params: nextParams,
      spawnCount: nextSpawnCount,
      speed: scene.speed ?? s.speed,
      cap: scene.cap ?? s.cap,
      pouring: false,
      falling: scene.falling === true,
      firing: false,
      smoking: false,
      replaceMode: true,
      spawnKind: scene.kind,
      spawnId: s.spawnId + 1,
      activeSceneId: scene.id,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  applyCreationConfig: (config) => {
    const nextParams: LabParams = { ...DEFAULT_PARAMS, ...config.params };
    const nextSpawnCount = Math.max(50, Math.min(200_000, Math.round(config.spawnCount)));
    const nextCap = Math.max(config.cap, nextSpawnCount);
    pushHistory(get());
    set((s) => ({
      clearId: s.clearId + 1,
      params: nextParams,
      spawnCount: nextSpawnCount,
      cap: nextCap,
      speed: config.speed,
      pouring: false,
      falling: config.spawnKind === "fall",
      firing: config.spawnKind === "fire",
      smoking: config.spawnKind === "smoke",
      replaceMode: true,
      spawnKind: config.spawnKind as GeneratorKind,
      spawnId: s.spawnId + 1,
      activeSceneId: null,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  clearSim: () => {
    pushHistory(get());
    set((s) => ({
      clearId: s.clearId + 1,
      pouring: false,
      falling: false,
      firing: false,
      smoking: false,
      activeSceneId: null,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  undo: () => {
    const snap = past.pop();
    if (!snap) return;
    const s = get();
    future.push(takeSnap(s));
    set({ ...applySnap(s, snap), canUndo: past.length > 0, canRedo: true });
  },
  redo: () => {
    const snap = future.pop();
    if (!snap) return;
    const s = get();
    past.push(takeSnap(s));
    set({ ...applySnap(s, snap), canUndo: true, canRedo: future.length > 0 });
  },
}));
