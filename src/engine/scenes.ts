import { type GeneratorKind, type LabParams } from "./types.ts";

/**
 * Curated one-tap scenes. Each scene composes an EXISTING GeneratorKind with a
 * hand-tuned Partial<LabParams> patch. There is deliberately no dedicated
 * "black-hole"/"collision" generator: those looks are produced by tuning the
 * physics params on top of a base generator (nbody, galaxy, ring, etc.).
 *
 * At apply time the store layers `scene.params` over a fresh DEFAULT_PARAMS
 * baseline, so any toggle a scene does NOT set is reset to its default (stale
 * flags from a previously applied scene never leak). Because of that, each
 * `params` below only lists the fields that differ from DEFAULT_PARAMS.
 */

export type SceneId =
  | "black-hole"
  | "galaxy-collision"
  | "fireworks"
  | "murmuration"
  | "whirlpool"
  | "flow-field"
  | "waterfall"
  | "cloth"
  | "nebula";

/** Speed multiplier values accepted by the store (mirrors SpeedMul in lab-store). */
export type SceneSpeed = 0.25 | 0.5 | 1 | 2 | 4;

export type Scene = {
  id: SceneId;
  label: string;
  description?: string;
  kind: GeneratorKind;
  /** Only the fields that differ from DEFAULT_PARAMS. */
  params: Partial<LabParams>;
  /** Requested particle count; clamped to 50..200000 by the store on apply. */
  spawnCount: number;
  /** Optional simulation speed multiplier. */
  speed?: SceneSpeed;
  /** Optional buffer cap override. */
  cap?: number;
};

/**
 * Display order = array order. Kept to 9 curated scenes (within the 8-10 range).
 */
export const SCENES: Scene[] = [
  {
    id: "black-hole",
    label: "Black Hole",
    description: "A dense disk falling into a heavy singularity, streaked with additive trails.",
    kind: "nbody",
    params: {
      nbody: true,
      nbodyG: 0.06,
      centralMass: 6.5,
      softening: 0.006,
      drag: 0.004,
      trails: true,
      trailDecay: 0.08,
      trailLength: 1.1,
      blend: "additive",
      palette: "plasma",
      colorMap: "speed",
      boundary: "wrap",
      pointSize: 2.2,
    },
    spawnCount: 6000,
  },
  {
    id: "galaxy-collision",
    label: "Galaxy Collision",
    description: "Two spiral arms sweeping past a bright core with luminous orbital trails.",
    kind: "galaxy",
    params: {
      nbody: false,
      centralMass: 3.2,
      drag: 0.02,
      trails: true,
      trailDecay: 0.1,
      trailLength: 0.95,
      blend: "additive",
      palette: "aurora",
      colorMap: "palette",
      boundary: "wrap",
      pointSize: 2.4,
    },
    spawnCount: 9000,
    speed: 2,
  },
  {
    id: "fireworks",
    label: "Fireworks",
    description: "Radial bursts that arc under gravity and fade over their lifespan.",
    kind: "burst",
    params: {
      trails: true,
      trailDecay: 0.12,
      trailLength: 0.9,
      lifespan: 3.4,
      gravityY: 0.55,
      drag: 0.02,
      blend: "additive",
      palette: "solar",
      colorMap: "life",
      pointSize: 3.4,
      lifeFadeOut: 0.4,
    },
    spawnCount: 4000,
  },
  {
    id: "murmuration",
    label: "Murmuration",
    description: "A cohesive flocking swarm that folds and turns like starlings at dusk.",
    kind: "flock",
    params: {
      flock: true,
      flockSep: 1.2,
      flockAli: 1.6,
      flockCoh: 1.3,
      flockRadius: 0.07,
      drag: 0.015,
      palette: "aurora",
      colorMap: "speed",
      blend: "alpha",
      pointSize: 2.6,
    },
    spawnCount: 4000,
  },
  {
    id: "whirlpool",
    label: "Whirlpool",
    description: "An SPH fluid ring dragged into a spinning vortex inside bouncing walls.",
    kind: "ring",
    params: {
      sph: true,
      sphRestDensity: 20,
      sphPressure: 5.5,
      sphViscosity: 0.12,
      sphSmoothing: 0.03,
      centralMass: 2.2,
      drag: 0.03,
      boundary: "bounce",
      palette: "ice",
      colorMap: "density",
      blend: "alpha",
      pointSize: 3.0,
    },
    spawnCount: 5000,
  },
  {
    id: "flow-field",
    label: "Flow Field",
    description: "Particles combed through an animated curl-noise flow field.",
    kind: "flock",
    params: {
      flow: true,
      flowStrength: 2.6,
      flowScale: 4.0,
      flowSpeed: 0.6,
      drag: 0.06,
      palette: "plasma",
      colorMap: "speed",
      blend: "additive",
      trails: true,
      trailDecay: 0.16,
      pointSize: 2.2,
    },
    spawnCount: 8000,
  },
  {
    id: "waterfall",
    label: "Waterfall",
    description: "A heavy cascade pouring from the top and splashing off the floor.",
    kind: "fall",
    params: {
      gravityY: 0.9,
      drag: 0.02,
      palette: "ice",
      colorMap: "speed",
      boundary: "bounce",
      restitution: 0.25,
      blend: "alpha",
      pointSize: 2.8,
    },
    spawnCount: 800,
    speed: 1,
  },
  {
    id: "cloth",
    label: "Cloth",
    description: "A pinned spring-mesh sheet that sags and settles under gravity.",
    kind: "cloth",
    params: {
      settle: true,
      gravityY: 0.85,
      clothIterations: 8,
      collide: false,
      drag: 0.22,
      palette: "mono",
      colorMap: "mass",
      blend: "alpha",
      pointSize: 3.2,
    },
    spawnCount: 936,
  },
  {
    id: "nebula",
    label: "Nebula",
    description: "A soft glowing cloud drifting outward with a heavy additive bloom.",
    kind: "galaxy",
    params: {
      centralMass: 0.9,
      drag: 0.05,
      bloom: true,
      bloomStrength: 2.6,
      blend: "additive",
      palette: "aurora",
      colorMap: "palette",
      trails: true,
      trailDecay: 0.14,
      trailLength: 0.85,
      pointSize: 3.0,
    },
    spawnCount: 7000,
  },
];
