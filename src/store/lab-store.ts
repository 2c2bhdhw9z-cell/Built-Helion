import { create } from "zustand";
import { toast } from "sonner";
import {
  DEFAULT_CAP,
  DEFAULT_PARAMS,
  DEFAULT_TELEMETRY,
  QUALITY_CAPS,
  SYSTEM_LIMIT,
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
import { clampViewPitch, clampViewZoom } from "@/engine/camera";
import type { CreationConfig } from "@/lib/creations/types";
import type { SerializedField } from "@/engine/force-field";
import type { PaletteStop } from "@/engine/palette-stops";
import { DEFAULT_AUDIO_MAPPINGS, normalizeMappings, type AudioMapping } from "@/engine/audio-modulation";
import {
  addKeyframe as addKf,
  createTrack,
  normalizeTrack,
  removeKeyframe as removeKf,
  trackDuration,
  type AnimatableParams,
  type Track,
} from "@/engine/timeline";
import { canRecord as canRecordCapability } from "@/lib/capture/mime";
import { useSession } from "@/lib/multiplayer/session-store";
import type { PlanId } from "@/lib/billing/types";
import type { ExportSize, RecordFps } from "@/lib/capture/composite";
import type { ImageSample } from "@/lib/import/image-particles";
import type { CsvParticle } from "@/lib/import/csv";
import { kv } from "@/lib/platform/storage";

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
  /** True when the daily-challenge (seed-of-the-day) dialog is open (Item 7). */
  dailyOpen: boolean;
  /**
   * Read-only embed mode (Item 10): the chromeless `/embed/:id` player sets this
   * so LabApp renders with NO menus/HUD/tools and the sim just autoplays. It is
   * a session-only view flag (never persisted).
   */
  viewOnly: boolean;
  upgradeOpen: boolean;
  /** True when the signed-in plan or active trial unlocks Pro generators / 4K. */
  entitled: boolean;
  plan: PlanId;
  historyOpen: boolean;
  developerOpen: boolean;
  createOpen: boolean;
  playOpen: boolean;
  viewOrbit: boolean;
  imageSpawnId: number;
  imageSamples: ImageSample[] | null;
  csvSpawnId: number;
  csvRows: CsvParticle[] | null;
  listenToken: string | null;
  spriteObjectUrl: string | null;
  exportSize: ExportSize;
  exportAlpha: boolean;
  recordFps: RecordFps;
  perfHubOpen: boolean;
  perfCompact: boolean;
  helpOpen: boolean;
  /** Whether the keyframe timeline panel is open (Item 1). */
  timelineOpen: boolean;
  viewZoom: number;
  viewPanX: number;
  viewPanY: number;
  viewRotate: number;
  viewPitch: number;
  /**
   * When on, zoom-out grows world bounds so leftover screen is playground.
   * When off, zoom-out is a CSS letterbox (the old shrink-the-picture behavior).
   */
  fillFrame: boolean;
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
  /**
   * Serialized painted force field (Item 4). Null when no field is painted. The
   * store is authoritative for persistence: CanvasStage mirrors the engine's
   * live painted field back into here (via setFieldData) so save/undo/session
   * snapshots capture it, and applyCreationConfig pushes it back to the engine.
   */
  fieldData: SerializedField | null;
  /**
   * A monotonically increasing token bumped whenever fieldData changes from a
   * SOURCE OTHER than the engine's own paint loop (config load, clear, remote).
   * CanvasStage watches this to push the field into the engine, without echoing
   * the engine's own paint back at it.
   */
  fieldApplyId: number;
  /**
   * Custom multi-stop palette (Item 5). Empty when using a built-in palette or
   * the two-stop colorA/colorB gradient. Persisted in the creation config.
   */
  paletteStops: PaletteStop[];
  /**
   * Audio-reactive source->target mappings (Item 2). Drives point size / spawn
   * / force / gravity / palette from the mic or a music file. Persisted in the
   * creation config so a saved audio-reactive scene replays its mapping.
   */
  audioMappings: AudioMapping[];
  /**
   * Keyframe timeline (Item 1). A sorted list of keyframes over an animatable
   * subset of params, plus playback state. The engine advances the playhead
   * each frame while `timelinePlaying` and applies the sampled params; the store
   * is authoritative for the track + playing flag and mirrors the live playhead
   * back for the scrub UI. Persisted in the creation config.
   */
  timelineTrack: Track;
  timelinePlaying: boolean;
  timelinePlayhead: number;
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
  setDailyOpen: (v: boolean) => void;
  setViewOnly: (v: boolean) => void;
  setUpgradeOpen: (v: boolean) => void;
  setEntitled: (v: boolean) => void;
  setPlan: (p: PlanId) => void;
  setHistoryOpen: (v: boolean) => void;
  setDeveloperOpen: (v: boolean) => void;
  setCreateOpen: (v: boolean) => void;
  setPlayOpen: (v: boolean) => void;
  setViewOrbit: (v: boolean) => void;
  applyAiScene: (scene: { generator: GeneratorKind; spawnCount: number; params: Partial<LabParams> }) => void;
  spawnImageSamples: (samples: ImageSample[]) => void;
  spawnCsvRows: (rows: CsvParticle[]) => void;
  setListenToken: (v: string | null) => void;
  setSpriteMedia: (url: string | null) => void;
  setExportSize: (v: ExportSize) => void;
  setExportAlpha: (v: boolean) => void;
  setRecordFps: (v: RecordFps) => void;
  setPerfHubOpen: (v: boolean) => void;
  setPerfCompact: (v: boolean) => void;
  setTimelineOpen: (v: boolean) => void;
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
  setView: (v: Partial<{ zoom: number; panX: number; panY: number; rotate: number; pitch: number }>) => void;
  resetView: () => void;
  setFillFrame: (v: boolean) => void;
  setQuality: (q: QualityMode) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Mirror the engine's live painted field into the store (no re-apply). */
  setFieldData: (field: SerializedField | null) => void;
  /** Replace the field AND signal CanvasStage to push it into the engine. */
  applyFieldData: (field: SerializedField | null) => void;
  /** Set the custom multi-stop palette. */
  setPaletteStops: (stops: PaletteStop[]) => void;
  /** Replace the audio-reactive mappings. */
  setAudioMappings: (mappings: AudioMapping[]) => void;
  /** Capture the current animatable params as a keyframe at the given time. */
  addTimelineKeyframe: (t: number) => void;
  /** Remove the keyframe at index i. */
  removeTimelineKeyframe: (i: number) => void;
  /** Replace the whole track (e.g. toggle loop, clear). */
  setTimelineTrack: (track: Track) => void;
  /** Start/stop playback. */
  setTimelinePlaying: (v: boolean) => void;
  /** Set the playhead (scrub or engine mirror). */
  setTimelinePlayhead: (t: number) => void;
};

/**
 * Snapshot the current sim into a savable CreationConfig. Pure and derivable
 * from a LabState slice so both the Save UI and unit tests can use it without
 * React. `spawnKind` falls back to 'galaxy' when null, matching the store's
 * existing fallbacks in addParticles/runGenerator.
 */
export function currentCreationConfig(
  state: Pick<
    LabState,
    | "params"
    | "spawnKind"
    | "spawnCount"
    | "speed"
    | "cap"
    | "fieldData"
    | "audioMappings"
    | "timelineTrack"
  >,
): CreationConfig {
  return {
    // params carries the custom palette stops (params.paletteStops), so it is
    // persisted for free here.
    params: { ...state.params },
    spawnKind: state.spawnKind ?? "galaxy",
    spawnCount: state.spawnCount,
    speed: state.speed,
    // Capture the buffer cap so a high-count creation reproduces at full
    // particle count on load (mirrors how applyScene persists scene.cap).
    cap: state.cap,
    // Persist the painted force field so a saved creation reproduces it.
    // Omitted (undefined) when unset so older/clean configs stay minimal.
    ...(state.fieldData ? { field: state.fieldData } : {}),
    // Persist audio-reactive mappings only when the scene actually uses them.
    ...(state.params.audioReactive && state.audioMappings.length
      ? { audioMappings: state.audioMappings }
      : {}),
    // Persist the keyframe timeline only when it has keyframes so a saved
    // animated creation replays.
    ...(state.timelineTrack.keys.length ? { timeline: state.timelineTrack } : {}),
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
  const nextSpawnCount = Math.max(50, Math.min(SYSTEM_LIMIT, Math.round(snap.spawnCount)));
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

function readFillFrame(): boolean {
  try {
    return kv().get("helion.fillFrame") !== "0";
  } catch {
    return true;
  }
}

function writeFillFrame(v: boolean) {
  try {
    kv().set("helion.fillFrame", v ? "1" : "0");
  } catch {
    /* ignore */
  }
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

const past: HistorySnap[] = [];
let future: HistorySnap[] = [];

function pushHistory(s: LabState) {
  past.push(takeSnap(s));
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
}

let lastViewToast = 0;
let remoteApply = 0;

/** SessionRoom wraps inbound mesh events so view-only peers still receive them. */
export function withRemoteApply(fn: () => void): void {
  remoteApply += 1;
  try {
    fn();
  } finally {
    remoteApply -= 1;
  }
}

function rejectIfView(): boolean {
  if (remoteApply > 0) return false;
  if (useSession.getState().role !== "view") return false;
  if (Date.now() - lastViewToast > 2500) {
    lastViewToast = Date.now();
    toast.error("You're view-only in this session");
  }
  return true;
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
  dailyOpen: false,
  viewOnly: false,
  upgradeOpen: false,
  entitled: false,
  plan: "free",
  historyOpen: false,
  developerOpen: false,
  createOpen: false,
  playOpen: false,
  viewOrbit: false,
  imageSpawnId: 0,
  imageSamples: null,
  csvSpawnId: 0,
  csvRows: null,
  listenToken: null,
  spriteObjectUrl: null,
  exportSize: "4k",
  exportAlpha: false,
  recordFps: 60,
  perfHubOpen: false,
  perfCompact: false,
  helpOpen: false,
  timelineOpen: false,
  viewZoom: 1,
  viewPanX: 0,
  viewPanY: 0,
  viewRotate: 0,
  viewPitch: 0,
  fillFrame: readFillFrame(),
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
  fieldData: null,
  fieldApplyId: 0,
  paletteStops: [],
  audioMappings: [...DEFAULT_AUDIO_MAPPINGS],
  timelineTrack: createTrack(true),
  timelinePlaying: false,
  timelinePlayhead: 0,
  canUndo: false,
  canRedo: false,
  setParam: (key, value) => {
    if (rejectIfView()) return;
    set((s) => ({ params: { ...s.params, [key]: value }, activeSceneId: null }));
  },
  patchParams: (p) => {
    if (rejectIfView()) return;
    set((s) => ({ params: { ...s.params, ...p }, activeSceneId: null }));
  },
  setTelemetry: (t) => set({ telemetry: t }),
  setPaused: (v) => {
    if (rejectIfView()) return;
    set({ paused: v });
  },
  setSpeed: (v) => {
    if (rejectIfView()) return;
    set({ speed: v });
  },
  setCap: (v) => set({ cap: Math.max(1024, Math.min(SYSTEM_LIMIT, v | 0)) }),
  setTool: (t) => {
    if (rejectIfView()) return;
    set({ tool: t });
  },
  setBrush: (radius, strength) => {
    if (rejectIfView()) return;
    set({ brushRadius: radius, brushStrength: strength });
  },
  setPointer: (p) => set((s) => ({ pointer: { ...s.pointer, ...p } })),
  setReplace: (v) => set({ replaceMode: v }),
  setSpawnCount: (n) => set({ spawnCount: Math.max(50, Math.min(SYSTEM_LIMIT, Math.round(n))) }),
  addParticles: () => {
    if (rejectIfView()) return;
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
  setDailyOpen: (v) => set({ dailyOpen: v }),
  setViewOnly: (v) => set({ viewOnly: v }),
  setUpgradeOpen: (v) => set({ upgradeOpen: v }),
  setEntitled: (v) => set({ entitled: v }),
  setPlan: (p) => set({ plan: p }),
  setHistoryOpen: (v) => set({ historyOpen: v }),
  setDeveloperOpen: (v) => set({ developerOpen: v }),
  setCreateOpen: (v) => set({ createOpen: v }),
  setPlayOpen: (v) => set({ playOpen: v }),
  setViewOrbit: (v) => set({ viewOrbit: v }),
  applyAiScene: (scene) => {
    if (rejectIfView()) return;
    pushHistory(get());
    set((s) => ({
      params: { ...s.params, ...scene.params },
      spawnKind: scene.generator,
      spawnCount: Math.max(50, Math.min(SYSTEM_LIMIT, Math.round(scene.spawnCount))),
      spawnId: s.spawnId + 1,
      replaceMode: true,
      activeSceneId: null,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  spawnImageSamples: (samples) => {
    if (rejectIfView()) return;
    pushHistory(get());
    set((s) => ({
      imageSamples: samples,
      imageSpawnId: s.imageSpawnId + 1,
      replaceMode: true,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  spawnCsvRows: (rows) => {
    if (rejectIfView()) return;
    pushHistory(get());
    set((s) => ({
      csvRows: rows,
      csvSpawnId: s.csvSpawnId + 1,
      replaceMode: true,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  setListenToken: (v) => set({ listenToken: v }),
  setSpriteMedia: (url) => {
    const prev = get().spriteObjectUrl;
    if (prev && prev !== url) revokeBg(prev);
    set({ spriteObjectUrl: url });
    if (url) {
      set((s) => ({ params: { ...s.params, shape: "sprite", pointSize: Math.max(s.params.pointSize, 8) } }));
    }
  },
  setExportSize: (v) => set({ exportSize: v }),
  setExportAlpha: (v) => set({ exportAlpha: v }),
  setRecordFps: (v) => set({ recordFps: v }),
  setPerfHubOpen: (v) => set({ perfHubOpen: v }),
  setPerfCompact: (v) => set({ perfCompact: v }),
  setTimelineOpen: (v) => set({ timelineOpen: v }),
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
      viewZoom: v.zoom !== undefined ? clampViewZoom(v.zoom) : s.viewZoom,
      viewPanX: v.panX !== undefined ? v.panX : s.viewPanX,
      viewPanY: v.panY !== undefined ? v.panY : s.viewPanY,
      viewRotate:
        v.rotate !== undefined ? Math.min(180, Math.max(-180, v.rotate)) : s.viewRotate,
      viewPitch: v.pitch !== undefined ? clampViewPitch(v.pitch) : s.viewPitch,
    })),
  resetView: () => set({ viewZoom: 1, viewPanX: 0, viewPanY: 0, viewRotate: 0, viewPitch: 0 }),
  setFillFrame: (v) => {
    writeFillFrame(v);
    set({ fillFrame: v });
  },
  setQuality: (q) =>
    set(() => ({
      quality: q,
      cap: QUALITY_CAPS[q],
    })),
  runGenerator: (kind) => {
    if (rejectIfView()) return;
    if (isProGenerator(kind) && !get().entitled) {
      set({ upgradeOpen: true });
      return;
    }
    const patch = GENERATOR_PRESETS[kind] ?? {};
    const stream = kind === "pour" || kind === "fall" || kind === "fire" || kind === "smoke";
    const burst = kind !== "pour" && kind !== "fall";
    pushHistory(get());
    void import("@/lib/play/analytics").then(({ noteSpawn }) => noteSpawn(kind));
    void import("@/lib/play/progress").then(({ noteChallenge, awardBadge }) => {
      noteChallenge(kind);
      awardBadge("first-spark");
      if (get().params.shape === "emoji") noteChallenge("emoji");
    });
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
    if (rejectIfView()) return;
    const scene = SCENES.find((s) => s.id === id);
    if (!scene) return;
    const nextParams: LabParams = { ...DEFAULT_PARAMS, ...scene.params };
    const nextSpawnCount = Math.max(50, Math.min(SYSTEM_LIMIT, Math.round(scene.spawnCount)));
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
    if (rejectIfView()) return;
    const nextParams: LabParams = { ...DEFAULT_PARAMS, ...config.params };
    const nextSpawnCount = Math.max(50, Math.min(SYSTEM_LIMIT, Math.round(config.spawnCount)));
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
      // Restore the painted field from the config, and bump fieldApplyId so
      // CanvasStage pushes it into the engine. The custom palette rides along
      // inside params (params.paletteStops); mirror it into the editor copy.
      fieldData: config.field ?? null,
      fieldApplyId: s.fieldApplyId + 1,
      paletteStops: nextParams.paletteStops ?? [],
      // normalizeMappings is the single source of truth for the 0..2 amount
      // clamp (and drops unknown source/target); the zod schema only checks
      // finiteness, so apply it here on the load path (loads + forks all flow
      // through applyCreationConfig) before the mappings reach the engine.
      audioMappings: config.audioMappings
        ? normalizeMappings(config.audioMappings)
        : [...DEFAULT_AUDIO_MAPPINGS],
      timelineTrack: (config.timeline ? normalizeTrack(config.timeline) : null) ?? createTrack(true),
      timelinePlaying: false,
      timelinePlayhead: 0,
      canUndo: past.length > 0,
      canRedo: false,
    }));
  },
  clearSim: () => {
    if (rejectIfView()) return;
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
  setFieldData: (field) => set({ fieldData: field }),
  applyFieldData: (field) => {
    if (rejectIfView()) return;
    set((s) => ({ fieldData: field, fieldApplyId: s.fieldApplyId + 1 }));
  },
  setAudioMappings: (mappings) => {
    if (rejectIfView()) return;
    set({ audioMappings: mappings, activeSceneId: null });
  },
  addTimelineKeyframe: (t) => {
    if (rejectIfView()) return;
    const p = get().params;
    const snap: Partial<AnimatableParams> = {
      gravityX: p.gravityX,
      gravityY: p.gravityY,
      drag: p.drag,
      pointSize: p.pointSize,
      forceStrength: p.forceStrength,
      trailLength: p.trailLength,
      flowStrength: p.flowStrength,
      bloomStrength: p.bloomStrength,
      nbodyG: p.nbodyG,
      centralMass: p.centralMass,
      palette: p.palette,
      shape: p.shape,
    };
    set((s) => ({ timelineTrack: addKf(s.timelineTrack, t, snap) }));
  },
  removeTimelineKeyframe: (i) => {
    if (rejectIfView()) return;
    set((s) => {
      const track = removeKf(s.timelineTrack, i);
      return {
        timelineTrack: track,
        timelinePlayhead: Math.min(s.timelinePlayhead, trackDuration(track)),
      };
    });
  },
  setTimelineTrack: (track) => {
    if (rejectIfView()) return;
    set((s) => ({ timelineTrack: track, timelinePlayhead: Math.min(s.timelinePlayhead, trackDuration(track)) }));
  },
  setTimelinePlaying: (v) => {
    if (rejectIfView()) return;
    set({ timelinePlaying: v });
  },
  setTimelinePlayhead: (t) => set({ timelinePlayhead: t }),
  setPaletteStops: (stops) => {
    if (rejectIfView()) return;
    // Route custom stops into params so the renderers (which only see params)
    // pick them up; drop the field entirely when cleared so the built-in
    // palette path resumes.
    set((s) => ({
      params: { ...s.params, paletteStops: stops.length ? stops : undefined },
      paletteStops: stops,
      activeSceneId: null,
    }));
  },
  undo: () => {
    if (rejectIfView()) return;
    const snap = past.pop();
    if (!snap) return;
    const s = get();
    future.push(takeSnap(s));
    set({ ...applySnap(s, snap), canUndo: past.length > 0, canRedo: true });
  },
  redo: () => {
    if (rejectIfView()) return;
    const snap = future.pop();
    if (!snap) return;
    const s = get();
    past.push(takeSnap(s));
    set({ ...applySnap(s, snap), canUndo: true, canRedo: future.length > 0 });
  },
}));
