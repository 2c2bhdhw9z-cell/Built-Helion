export const SYSTEM_LIMIT = 1_000_000;
export const DEFAULT_CAP = 65_536;
export const HASH_MAX_PER_CELL = 24;
export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 5;
export const MAX_ACCEL = 80;
export const MAX_SPEED = 12;

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
  | "text";

export type ToolKind =
  | "attract"
  | "wall"
  | "repel"
  | "repulsor"
  | "vortex"
  | "paint"
  | "freeze";

export type BlendMode = "additive" | "alpha";
export type ParticleShape = "circle" | "square" | "ring" | "diamond";
export type BoundaryMode = "bounce" | "wrap" | "destroy";
export type ColorMap = "life" | "speed" | "density" | "mass" | "palette";
export type PaletteId = "rainbow" | "ember" | "ice" | "aurora" | "solar" | "mono" | "plasma";
export type ParamTab = "physics" | "visuals" | "trails" | "collide" | "tilt" | "fluid" | "settle" | "flow" | "bloom" | "audio" | "walls";

export const FLAG_PINNED = 1;
export const FLAG_SLEEP = 2;
export const FLAG_CLOTH = 4;

export type Spring = { a: number; b: number; rest: number; k: number };

export type ContinuousEmitter = {
  kind: "pour" | "fall";
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
};

export type PointerState = {
  x: number;
  y: number;
  down: boolean;
  inside: boolean;
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
};
