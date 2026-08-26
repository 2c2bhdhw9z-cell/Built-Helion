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

export type SpeedMul = 0.25 | 0.5 | 1 | 2 | 4;

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
  feedbackOpen: boolean;
  uiTopOpen: boolean;
  uiBottomOpen: boolean;
  tiltX: number;
  tiltY: number;
  spawnId: number;
  spawnKind: GeneratorKind | null;
  clearId: number;
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
  setFeedbackOpen: (open: boolean) => void;
  toggleUiTop: () => void;
  toggleUiBottom: () => void;
  setTilt: (x: number, y: number) => void;
  runGenerator: (kind: GeneratorKind) => void;
  clearSim: () => void;
};

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
  feedbackOpen: false,
  uiTopOpen: true,
  uiBottomOpen: true,
  tiltX: 0,
  tiltY: 0,
  spawnId: 0,
  spawnKind: "galaxy",
  clearId: 0,
  setParam: (key, value) => set((s) => ({ params: { ...s.params, [key]: value } })),
  patchParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
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
  setFeedbackOpen: (open) => set({ feedbackOpen: open }),
  toggleUiTop: () => set((s) => ({ uiTopOpen: !s.uiTopOpen })),
  toggleUiBottom: () => set((s) => ({ uiBottomOpen: !s.uiBottomOpen })),
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
    }));
  },
  clearSim: () =>
    set((s) => ({
      clearId: s.clearId + 1,
      pouring: false,
      falling: false,
    })),
}));
