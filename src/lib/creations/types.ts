import { z } from "zod";
import {
  DEFAULT_CAP,
  DEFAULT_PARAMS,
  GENERATOR_KINDS,
  SYSTEM_LIMIT,
  type GeneratorKind,
  type LabParams,
} from "@/engine/types";

/**
 * Client-safe creations model + zod schemas. This file MUST stay free of any
 * server-only imports (no @/lib/db, no server.ts) so the browser bundle, the
 * (future) creations UI, the public share route, and the server functions can
 * all import it.
 *
 * A "creation" stores the sim's CONFIG only — the full LabParams plus the
 * generator kind, particle count, and speed — never live particle positions.
 *
 * SECURITY: a shared config blob is UNTRUSTED input (it round-trips through a
 * public link that anyone can craft). `creationConfigSchema` therefore
 * whitelists EXACTLY the DEFAULT_PARAMS keys, coerces/clamps every field to the
 * default on anything invalid, and strips unknown keys — so a malformed or
 * hostile payload can never crash the loader or smuggle extra fields into the
 * store.
 */

/** The generator kinds the sim can spawn (mirrors GeneratorKind). */
export const generatorKinds: readonly GeneratorKind[] = GENERATOR_KINDS;

/** The allowed speed multipliers (mirrors SpeedMul in src/store/lab-store.ts). */
export const speedMuls = [0.25, 0.5, 1, 2, 4] as const;

/** Particle-count clamp, matching the store's setSpawnCount bounds. */
export const SPAWN_COUNT_MIN = 50;
export const SPAWN_COUNT_MAX = SYSTEM_LIMIT;

/**
 * Particle-buffer cap clamp. Mirrors the engine's `setCap` floor (1024, i.e.
 * the ParamDock cap slider's 2^10 minimum) and SYSTEM_LIMIT ceiling from
 * @/engine/types, so a saved/untrusted cap can never starve the emitter or
 * blow past the engine's hard capacity limit.
 */
export const CAP_MIN = 1024;
export const CAP_MAX = SYSTEM_LIMIT;

/**
 * A number field that falls back to `fallback` on anything non-finite/missing.
 * `.catch()` guarantees the field never rejects — an untrusted blob is always
 * coerced to a usable value.
 */
const num = (fallback: number) =>
  z.number().finite().catch(fallback).default(fallback);

/** An enum field that falls back to `fallback` when the value is not allowed. */
const enumField = <T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) => z.enum(values).catch(fallback).default(fallback);

/** A boolean field that falls back to `fallback` on anything non-boolean. */
const bool = (fallback: boolean) =>
  z.boolean().catch(fallback).default(fallback);

/**
 * The params sub-schema: EXACTLY the DEFAULT_PARAMS keys, each typed to its
 * primitive/enum with a `.catch()` fallback to the DEFAULT_PARAMS value. Any
 * unknown key is stripped (zod objects strip by default) and any invalid value
 * is coerced to its default, so parsing an untrusted blob always yields a
 * complete, valid LabParams.
 */
export const labParamsSchema: z.ZodType<LabParams> = z
  .object({
    gravityX: num(DEFAULT_PARAMS.gravityX),
    gravityY: num(DEFAULT_PARAMS.gravityY),
    drag: num(DEFAULT_PARAMS.drag),
    mass: num(DEFAULT_PARAMS.mass),
    lifespan: num(DEFAULT_PARAMS.lifespan),
    pointSize: num(DEFAULT_PARAMS.pointSize),
    shape: enumField(
      [
        "circle",
        "square",
        "ring",
        "diamond",
        "triangle",
        "star",
        "hex",
        "plus",
        "heart",
        "spark",
        "emoji",
        "sprite",
      ],
      DEFAULT_PARAMS.shape,
    ),
    blend: enumField(["additive", "alpha"], DEFAULT_PARAMS.blend),
    palette: enumField(
      ["rainbow", "ember", "ice", "aurora", "solar", "mono", "plasma"],
      DEFAULT_PARAMS.palette,
    ),
    colorMap: enumField(
      ["life", "speed", "density", "mass", "palette", "position"],
      DEFAULT_PARAMS.colorMap,
    ),
    lifeFadeIn: num(DEFAULT_PARAMS.lifeFadeIn),
    lifeFadeOut: num(DEFAULT_PARAMS.lifeFadeOut),
    trails: bool(DEFAULT_PARAMS.trails),
    trailDecay: num(DEFAULT_PARAMS.trailDecay),
    trailLength: num(DEFAULT_PARAMS.trailLength),
    collide: bool(DEFAULT_PARAMS.collide),
    restitution: num(DEFAULT_PARAMS.restitution),
    particleRadius: num(DEFAULT_PARAMS.particleRadius),
    boundary: enumField(["bounce", "wrap", "destroy"], DEFAULT_PARAMS.boundary),
    textInput: z.string().catch(DEFAULT_PARAMS.textInput).default(DEFAULT_PARAMS.textInput),
    tiltEnabled: bool(DEFAULT_PARAMS.tiltEnabled),
    tiltScale: num(DEFAULT_PARAMS.tiltScale),
    sph: bool(DEFAULT_PARAMS.sph),
    sphRestDensity: num(DEFAULT_PARAMS.sphRestDensity),
    sphPressure: num(DEFAULT_PARAMS.sphPressure),
    sphViscosity: num(DEFAULT_PARAMS.sphViscosity),
    sphSmoothing: num(DEFAULT_PARAMS.sphSmoothing),
    settle: bool(DEFAULT_PARAMS.settle),
    settleThreshold: num(DEFAULT_PARAMS.settleThreshold),
    flock: bool(DEFAULT_PARAMS.flock),
    flockSep: num(DEFAULT_PARAMS.flockSep),
    flockAli: num(DEFAULT_PARAMS.flockAli),
    flockCoh: num(DEFAULT_PARAMS.flockCoh),
    flockRadius: num(DEFAULT_PARAMS.flockRadius),
    nbody: bool(DEFAULT_PARAMS.nbody),
    nbodyG: num(DEFAULT_PARAMS.nbodyG),
    centralMass: num(DEFAULT_PARAMS.centralMass),
    centralX: num(DEFAULT_PARAMS.centralX),
    centralY: num(DEFAULT_PARAMS.centralY),
    softening: num(DEFAULT_PARAMS.softening),
    clothIterations: num(DEFAULT_PARAMS.clothIterations),
    flow: bool(DEFAULT_PARAMS.flow),
    flowStrength: num(DEFAULT_PARAMS.flowStrength),
    flowScale: num(DEFAULT_PARAMS.flowScale),
    flowSpeed: num(DEFAULT_PARAMS.flowSpeed),
    bloom: bool(DEFAULT_PARAMS.bloom),
    bloomStrength: num(DEFAULT_PARAMS.bloomStrength),
    audioReactive: bool(DEFAULT_PARAMS.audioReactive),
    audioSensitivity: num(DEFAULT_PARAMS.audioSensitivity),
    background: enumField(
      ["void", "starfield", "gradient", "nebula", "image", "video"],
      DEFAULT_PARAMS.background,
    ),
    tint: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .catch(DEFAULT_PARAMS.tint)
      .default(DEFAULT_PARAMS.tint),
    emoji: z.string().min(1).max(8).catch(DEFAULT_PARAMS.emoji).default(DEFAULT_PARAMS.emoji),
    forceKind: enumField(
      ["off", "radial", "swirl", "sine", "expr"],
      DEFAULT_PARAMS.forceKind,
    ),
    forceStrength: num(DEFAULT_PARAMS.forceStrength),
    forceExprX: z.string().max(96).catch(DEFAULT_PARAMS.forceExprX).default(DEFAULT_PARAMS.forceExprX),
    forceExprY: z.string().max(96).catch(DEFAULT_PARAMS.forceExprY).default(DEFAULT_PARAMS.forceExprY),
    colorA: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .catch(DEFAULT_PARAMS.colorA)
      .default(DEFAULT_PARAMS.colorA),
    colorB: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .catch(DEFAULT_PARAMS.colorB)
      .default(DEFAULT_PARAMS.colorB),
  })
  .catch({ ...DEFAULT_PARAMS }) as z.ZodType<LabParams>;

/**
 * The full saved config: the sim's params plus the spawn kind, particle count,
 * and speed. Every FIELD falls back to a safe default so a partial or malformed
 * object is coerced to a valid, runnable config — but a non-object input (total
 * garbage) still fails safeParse, letting normalizeCreationConfig return null so
 * callers can degrade gracefully rather than fabricate a config.
 */
export const creationConfigSchema = z.object({
  params: labParamsSchema.default({ ...DEFAULT_PARAMS }),
  spawnKind: enumField(
    [
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
    ],
    "galaxy",
  ),
  spawnCount: z
    .number()
    .finite()
    .transform((n) => Math.max(SPAWN_COUNT_MIN, Math.min(SPAWN_COUNT_MAX, Math.round(n))))
    .catch(5000)
    .default(5000),
  speed: z
    .union([z.literal(0.25), z.literal(0.5), z.literal(1), z.literal(2), z.literal(4)])
    .catch(1)
    .default(1),
  // The particle-buffer cap at save time. Captured so a creation saved above
  // the default cap (e.g. a high-count nbody) reproduces at full particle count
  // on load instead of being silently truncated to the fresh session's cap.
  // Optional-with-default so older stored rows without `cap` still normalize,
  // and clamped to CAP_MIN..CAP_MAX with a safe DEFAULT_CAP fallback for any
  // out-of-range / non-finite / missing value (same untrusted-input discipline
  // as spawnCount).
  cap: z
    .number()
    .finite()
    .transform((n) => Math.max(CAP_MIN, Math.min(CAP_MAX, Math.round(n))))
    .catch(DEFAULT_CAP)
    .default(DEFAULT_CAP),
});

/** The validated, always-complete saved config. */
export type CreationConfig = z.infer<typeof creationConfigSchema>;

/** Validates a save request: a trimmed name + a (sanitized) config payload. */
export const saveCreationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  config: creationConfigSchema,
});

export type SaveCreationInput = z.infer<typeof saveCreationSchema>;

/** Validates a delete request (an id owned by the caller). */
export const deleteCreationSchema = z.object({
  id: z.string().min(1),
});

export type DeleteCreationInput = z.infer<typeof deleteCreationSchema>;

/** Validates a public share read (just the creation id / share token). */
export const sharedCreationSchema = z.object({
  id: z.string().min(1),
});

export type SharedCreationInput = z.infer<typeof sharedCreationSchema>;

/**
 * A creation row as stored in and returned from Postgres (owner-scoped).
 * `created_at` is a `timestamptz` column: the pg/PGLite drivers parse it into a
 * JS `Date` on the server and, once serialized across the server-function
 * boundary, an ISO `string` on the client — typed `string | Date` so both
 * shapes are honest (mirrors FeedbackItem).
 */
export interface CreationRow {
  id: string;
  user_id: string;
  name: string;
  config: CreationConfig;
  created_at: string | Date;
  is_public: boolean;
}

/**
 * Community library card. Author is a user-chosen display name (or "Helion"),
 * never an email or user id.
 */
export interface LibraryItem {
  id: string;
  name: string;
  config: CreationConfig;
  created_at: string | Date;
  author: string;
  likeCount: number;
  liked: boolean;
}

export const setPublicSchema = z.object({
  id: z.string().min(1),
  isPublic: z.boolean(),
});

export const toggleLikeSchema = z.object({
  id: z.string().min(1),
});

export const libraryQuerySchema = z.object({
  sort: z.enum(["recent", "featured"]).default("recent"),
});

/**
 * The PUBLIC projection of a creation — everything the share link needs to load
 * and run it and NOTHING else. It deliberately OMITS `user_id`, `created_at`,
 * and any owner data, so no PII or ownership info ever leaves the server on the
 * unauthenticated share path.
 */
export interface PublicCreation {
  id: string;
  name: string;
  config: CreationConfig;
}

/**
 * Parse an untrusted value into a complete CreationConfig, or null on total
 * garbage (e.g. a non-object), so callers can degrade gracefully. Safe to feed
 * a raw DB jsonb value or a share payload here.
 */
export function normalizeCreationConfig(value: unknown): CreationConfig | null {
  const parsed = creationConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
