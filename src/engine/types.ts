import type { ForceKind } from "./force-expr";

export const SYSTEM_LIMIT = 1_000_000;
export const DEFAULT_CAP = 65_536;
export const HASH_MAX_PER_CELL = 32;
export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 5;
export const MAX_ACCEL = 80;
export const MAX_SPEED = 12;

export type { ForceKind } from "./force-expr";

export type BackendKind = "webgpu" | "webgl" | "canvas";
export type ComputeKind = "webgpu" | "cpu";

export type GeneratorKind =
  | "galaxy"
  | "ring"
  | "burst"
  | "pour"
  | "fall"
  | "flock"
  | "cloth"
  | "nbody"
  | "text"
  | "fire"
  | "smoke"
  | "fireworks"
  | "water"
  | "tornado"
  | "lightning"
  | "blackhole"
  | "supernova"
  | "fibonacci"
  | "sierpinski"
  | "crystal"
  | "magma"
  | "aurora"
  | "helix"
  | "mandala"
  | "confetti"
  | "molecule";

export const GENERATOR_KINDS: readonly GeneratorKind[] = [
  "galaxy",
  "ring",
  "burst",
  "pour",
  "fall",
  "flock",
  "cloth",
  "nbody",
  "text",
  "fire",
  "smoke",
  "fireworks",
  "water",
  "tornado",
  "lightning",
  "blackhole",
  "supernova",
  "fibonacci",
  "sierpinski",
  "crystal",
  "magma",
  "aurora",
  "helix",
  "mandala",
  "confetti",
  "molecule",
];

/** Pro-tier generators. Free/unsigned visitors see them locked. */
export const PRO_GENERATORS: readonly GeneratorKind[] = [
  "crystal",
  "magma",
  "aurora",
  "helix",
  "mandala",
  "confetti",
];

export function isProGenerator(kind: GeneratorKind): boolean {
  return (PRO_GENERATORS as readonly string[]).includes(kind);
}

export type ToolKind =
  | "attract"
  | "wall"
  | "repel"
  | "repulsor"
  | "vortex"
  | "paint"
  | "freeze";

export type BlendMode = "additive" | "alpha";
export type ParticleShape =
  | "circle"
  | "square"
  | "ring"
  | "diamond"
  | "triangle"
  | "star"
  | "hex"
  | "plus"
  | "heart"
  | "spark"
  | "emoji"
  | "sprite";
export type BoundaryMode = "bounce" | "wrap" | "destroy";
export type ColorMap = "life" | "speed" | "density" | "mass" | "palette" | "position";
export type PaletteId = "rainbow" | "ember" | "ice" | "aurora" | "solar" | "mono" | "plasma";
export type BackgroundKind = "void" | "starfield" | "gradient" | "nebula" | "image" | "video";
export type QualityMode = "low" | "medium" | "high";
export type ParamTab =
  | "physics"
  | "visuals"
  | "view"
  | "trails"
  | "collide"
  | "tilt"
  | "fluid"
  | "settle"
  | "flow"
  | "bloom"
  | "audio"
  | "walls";

export function shapeId(shape: ParticleShape): number {
  switch (shape) {
    case "square":
      return 1;
    case "ring":
      return 2;
    case "diamond":
      return 3;
    case "triangle":
      return 4;
    case "star":
      return 5;
    case "hex":
      return 6;
    case "plus":
      return 7;
    case "heart":
      return 8;
    case "spark":
      return 9;
    case "emoji":
      return 10;
    case "sprite":
      return 11;
    default:
      return 0;
  }
}

export const FLAG_PINNED = 1;
export const FLAG_SLEEP = 2;
export const FLAG_CLOTH = 4;

export type Spring = { a: number; b: number; rest: number; k: number };

export type ContinuousEmitter = {
  kind: "pour" | "fall" | "fire" | "smoke";
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  rate: number;
  spread: number;
  speed: number;
  life: number;
  mass: number;
  acc: number;
};

export type LabParams = {
  gravityX: number;
  gravityY: number;
  drag: number;
  mass: number;
  lifespan: number;
  pointSize: number;
  shape: ParticleShape;
  blend: BlendMode;
  palette: PaletteId;
  colorMap: ColorMap;
  lifeFadeIn: number;
  lifeFadeOut: number;
  trails: boolean;
  trailDecay: number;
  trailLength: number;
  collide: boolean;
  restitution: number;
  particleRadius: number;
  boundary: BoundaryMode;
  textInput: string;
  tiltEnabled: boolean;
  tiltScale: number;
  sph: boolean;
  sphRestDensity: number;
  sphPressure: number;
  sphViscosity: number;
  sphSmoothing: number;
  sphCohesion: number;
  settle: boolean;
  settleThreshold: number;
  flock: boolean;
  flockSep: number;
  flockAli: number;
  flockCoh: number;
  flockRadius: number;
  nbody: boolean;
  nbodyG: number;
  centralMass: number;
  centralX: number;
  centralY: number;
  softening: number;
  clothIterations: number;
  flow: boolean;
  flowStrength: number;
  flowScale: number;
  flowSpeed: number;
  bloom: boolean;
  bloomStrength: number;
  audioReactive: boolean;
  audioSensitivity: number;
  background: BackgroundKind;
  tint: string;
  emoji: string;
  forceKind: ForceKind;
  forceStrength: number;
  forceExprX: string;
  forceExprY: string;
  colorA: string;
  colorB: string;
};

export type PointerState = {
  x: number;
  y: number;
  down: boolean;
  inside: boolean;
};

/** Second pointer used for a remote session brush. mode 0 = idle. */
export type ExtraBrush = {
  x: number;
  y: number;
  force: number;
  radius: number;
  mode: number;
};

export const IDLE_EXTRA_BRUSH: ExtraBrush = {
  x: 0,
  y: 0,
  force: 0,
  radius: 0,
  mode: 0,
};

/** Numeric brush id shared by CPU physics and the GPU uniform. */
export function brushMode(tool: ToolKind, down = true): number {
  if (!down) return 0;
  switch (tool) {
    case "attract":
      return 1;
    case "repel":
      return 2;
    case "repulsor":
      return 3;
    case "vortex":
      return 4;
    case "freeze":
      return 6;
    default:
      return 0;
  }
};


export type SubsystemCost = {
  /** Human-readable subsystem/mode label (e.g. "nbody", "flock", "physics"). */
  name: string;
  /** CPU cost attributed to the active mode set for the last frame, in ms. */
  ms: number;
};

export type Telemetry = {
  fps: number;
  frameMs: number;
  computeMs: number;
  renderMs: number;
  live: number;
  sleeping: number;
  cap: number;
  limit: number;
  ramBytes: number;
  nanCount: number;
  oobCount: number;
  backend: BackendKind;
  compute: ComputeKind;
  ready: boolean;
  /**
   * Real GPU/renderer draw calls issued last frame.
   * WebGL: gl.drawArrays count (fade + particle + post passes).
   * WebGPU: passEncoder.draw count (fade + particle + post passes).
   * Canvas2D: number of fillRect ops issued (background clear + per drawn particle).
   */
  drawCalls: number;
  /**
   * Real particle points/instances submitted to the GPU last frame.
   * WebGL: point count `n` submitted to gl.drawArrays(POINTS).
   * WebGPU: instance count passed to the particle draw.
   * Canvas2D: number of particles actually drawn (honoring `step` decimation).
   */
  drawnPoints: number;
  /**
   * Per-active-subsystem CPU cost for the last frame. Only populated when
   * compute === "cpu"; the ms is the honestly aggregated CPU physics time for
   * the active mode set (not fabricated per-mode splits). Empty when GPU compute
   * is active or nothing is running.
   */
  subsystems: SubsystemCost[];
  /** The last spawned generator/emitter label (GeneratorKind), or "" if none. */
  activeGenerator: string;
};

export const DEFAULT_PARAMS: LabParams = {
  gravityX: 0,
  gravityY: 0,
  drag: 0.03,
  mass: 1,
  lifespan: 0,
  pointSize: 2.8,
  shape: "circle",
  blend: "alpha",
  palette: "rainbow",
  colorMap: "palette",
  lifeFadeIn: 0.08,
  lifeFadeOut: 0.22,
  trails: false,
  trailDecay: 0.22,
  trailLength: 0.72,
  collide: false,
  restitution: 0.42,
  particleRadius: 0.0045,
  boundary: "bounce",
  textInput: "HELION",
  tiltEnabled: false,
  tiltScale: 1.6,
  sph: false,
  sphRestDensity: 18,
  sphPressure: 4.5,
  sphViscosity: 0.08,
  sphSmoothing: 0.028,
  sphCohesion: 0.42,
  settle: false,
  settleThreshold: 0.035,
  flock: false,
  flockSep: 1.4,
  flockAli: 1.0,
  flockCoh: 0.85,
  flockRadius: 0.055,
  nbody: false,
  nbodyG: 0.018,
  centralMass: 1.35,
  centralX: 0.5,
  centralY: 0.5,
  softening: 0.018,
  clothIterations: 6,
  flow: false,
  flowStrength: 1.5,
  flowScale: 3.0,
  flowSpeed: 0.5,
  bloom: false,
  bloomStrength: 1.5,
  audioReactive: false,
  audioSensitivity: 1.0,
  background: "void",
  tint: "#ffffff",
  emoji: "✨",
  forceKind: "off",
  forceStrength: 1,
  forceExprX: "sin(t + y * 6) * 0.4",
  forceExprY: "cos(t + x * 6) * 0.4",
  colorA: "#ffffff",
  colorB: "#ffffff",
};

export const DEFAULT_TELEMETRY: Telemetry = {
  fps: 0,
  frameMs: 0,
  computeMs: 0,
  renderMs: 0,
  live: 0,
  sleeping: 0,
  cap: DEFAULT_CAP,
  limit: SYSTEM_LIMIT,
  ramBytes: 0,
  nanCount: 0,
  oobCount: 0,
  backend: "canvas",
  compute: "cpu",
  ready: false,
  drawCalls: 0,
  drawnPoints: 0,
  subsystems: [],
  activeGenerator: "",
};

export const QUALITY_CAPS: Record<QualityMode, number> = {
  low: 12_288,
  medium: 32_768,
  high: 65_536,
};

/** Suggested buffer for a quality preset. Same for every plan — cap is not a paywall. */
export function qualityCap(quality: QualityMode): number {
  return QUALITY_CAPS[quality];
}

/** Max device-pixel-ratio the backing canvas is allowed to use. */
export const QUALITY_DPR: Record<QualityMode, number> = {
  low: 0.7,
  medium: 1.35,
  high: 2.5,
};

export const QUALITY_BLURB: Record<QualityMode, string> = {
  low: "Softer pixels — cooler on a phone",
  medium: "Balanced sharpness",
  high: "Full retina — crisp edges",
};

