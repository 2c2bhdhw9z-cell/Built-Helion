import { z } from "zod";
import {
  DEFAULT_CAP,
  DEFAULT_PARAMS,
  GENERATOR_KINDS,
  SYSTEM_LIMIT,
  type GeneratorKind,
  type LabParams,
} from "@/engine/types";
import { FIELD_MAX_RES } from "@/engine/force-field";

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
 * Length caps for the optional persisted arrays. These configs are UNTRUSTED
 * (they round-trip through saved creations, the public share link, and the
 * public library), so an un-capped array would let a crafted blob drive
 * unbounded per-frame and storage work. Each cap is sized to the real UI limit;
 * an oversized array is TRUNCATED to the cap (graceful degradation) rather than
 * rejecting the whole creation, matching the schema's coerce-with-default style.
 */
/** Max keyframes on the timeline. */
export const TIMELINE_KEYS_MAX = 256;
/** Max force-field cells: FIELD_MAX_RES² grid × 2 (vx,vy) per cell. */
export const FIELD_DATA_MAX = FIELD_MAX_RES * FIELD_MAX_RES * 2;
/** Max audio source→target mappings. */
export const AUDIO_MAPPINGS_MAX = 32;
/** Max custom-palette stops. */
export const PALETTE_STOPS_MAX = 64;

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
    sphCohesion: num(DEFAULT_PARAMS.sphCohesion),
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
    // Optional custom multi-stop palette (Item 5). Each stop is a #rrggbb color
    // at a 0..1 position. Absent when the creation uses a built-in palette or
    // the two-stop colorA/colorB gradient. Malformed stops are dropped so an
    // untrusted blob is coerced to a usable (possibly empty) list.
    paletteStops: z
      .array(
        z.object({
          pos: z.number().finite(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        }),
      )
      // Truncate an oversized list to the cap so a too-long array still loads
      // (bounded) instead of rejecting the whole creation.
      .transform((stops) => stops.slice(0, PALETTE_STOPS_MAX))
      .optional()
      .catch(undefined),
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
  // Optional painted vector force field (Item 4). Stored as a small resolution +
  // flat number[] so a saved creation replays the field particles follow. An
  // untrusted/garbage value is dropped by the engine's deserializeField guard,
  // so we only validate shape loosely here (res number + numeric data array).
  // Absent on older rows and on creations with no painted field.
  field: z
    .object({
      res: z.number().finite(),
      // Truncate to FIELD_DATA_MAX (= FIELD_MAX_RES² × 2) so an oversized blob
      // can't allocate/scan an unbounded grid; deserializeField re-validates
      // length against the clamped resolution and zero-fills the rest.
      data: z
        .array(z.number().finite())
        .transform((data) => data.slice(0, FIELD_DATA_MAX)),
    })
    .optional(),
  // Optional audio-reactive mappings (Item 2). Each maps an audio source to a
  // sim target with a 0..2 amount. Unknown sources/targets are handled by the
  // engine's normalizeMappings; here we only validate loose shape and drop the
  // field on total garbage. Absent when the creation isn't audio-reactive.
  audioMappings: z
    .array(
      z.object({
        source: z.enum(["bass", "mid", "level"]),
        target: z.enum(["size", "spawn", "force", "gravity", "palette"]),
        amount: z.number().finite(),
      }),
    )
    // Truncate to the cap; the load path runs the result through
    // normalizeMappings (single source of truth for the 0..2 amount clamp).
    .transform((mappings) => mappings.slice(0, AUDIO_MAPPINGS_MAX))
    .optional()
    .catch(undefined),
  // Optional keyframe timeline (Item 1). Loosely validated here (keys with a
  // numeric t + a params object); the engine's normalizeTrack does the strict
  // per-key coercion. Absent when the creation has no animation.
  timeline: z
    .object({
      keys: z
        .array(
        z.object({
          t: z.number().finite(),
          // The animatable subset (all optional). Strict keys keep CreationConfig
          // fully JSON-serializable (no `unknown`) so the server functions'
          // return types stay concrete; the engine's normalizeTrack does the
          // final coercion/clamping of untrusted values.
          params: z
            .object({
              gravityX: z.number().finite().optional(),
              gravityY: z.number().finite().optional(),
              drag: z.number().finite().optional(),
              pointSize: z.number().finite().optional(),
              forceStrength: z.number().finite().optional(),
              trailLength: z.number().finite().optional(),
              flowStrength: z.number().finite().optional(),
              bloomStrength: z.number().finite().optional(),
              nbodyG: z.number().finite().optional(),
              centralMass: z.number().finite().optional(),
              palette: z.string().optional(),
              shape: z.string().optional(),
            })
            .catch({}),
        }),
      )
        // Truncate to the cap so an oversized timeline still loads with a
        // bounded key list; normalizeTrack does the strict per-key coercion.
        .transform((keys) => keys.slice(0, TIMELINE_KEYS_MAX)),
      loop: z.boolean().optional(),
    })
    .optional()
    .catch(undefined),
});

/** The validated, always-complete saved config. */
export type CreationConfig = z.infer<typeof creationConfigSchema>;

/**
 * Free-tier private-creation quota (Item 23 — Pro tier). A "private" creation is
 * an unlisted row (`is_public = false`): reachable only via its unguessable
 * share id, never surfaced in the public library. Free/unsigned users may keep
 * up to `FREE_PRIVATE_CREATION_LIMIT` private creations; entitled (Pro /
 * Enterprise / active trial) users have no cap. Publishing a creation (making it
 * public) does NOT count against the quota — only unlisted rows do — so a free
 * user can always share widely; the paywall is specifically on hoarding private
 * drafts, which is the Pro perk.
 */
export const FREE_PRIVATE_CREATION_LIMIT = 3;

/**
 * Pure decision for whether a NEW private (unlisted) save is allowed (Item 23).
 * No I/O so it is directly unit-testable — the server supplies the caller's
 * current private-creation count and their entitlement, and this decides.
 *
 * Entitled users are always allowed (`true`). A free user is allowed only while
 * their existing private count is BELOW the free limit, so the (limit)th save
 * succeeds and the (limit+1)th is blocked. Publishing (a public save) is never
 * gated here — callers pass this only for the unlisted path.
 */
export function canSavePrivateCreation(
  currentPrivateCount: number,
  entitled: boolean,
): boolean {
  if (entitled) return true;
  return currentPrivateCount < FREE_PRIVATE_CREATION_LIMIT;
}

/**
 * The outcome of a save attempt that may hit the free private-creation quota
 * (Item 23). `status`:
 *   - "saved"        — the creation was stored; `row` is the new row.
 *   - "limit"        — a free user is at the private-creation cap; nothing was
 *                      stored. `limit` echoes the ceiling for the UI message.
 */
export type SaveCreationResult =
  | { status: "saved"; row: CreationRow }
  | { status: "limit"; limit: number };

/** Validates a save request: a trimmed name + a (sanitized) config payload. */
export const saveCreationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  config: creationConfigSchema,
});

export type SaveCreationInput = z.infer<typeof saveCreationSchema>;

/**
 * Validates an update-in-place request (Req 2 — save-conflict resolution).
 * Carries the creation `id`, the new `name` + `config`, and `baseUpdatedAt`:
 * the `updated_at` the client last loaded for this creation. The server
 * compares that base against the CURRENTLY stored `updated_at` to detect a
 * concurrent edit from another device — "newer wins with a warning" rather than
 * a silent last-write-wins overwrite. `baseUpdatedAt` is optional so a client
 * that never observed a timestamp (or an older client) still saves; a missing
 * base is treated as "no known base" and the update proceeds (documented in
 * `decideSaveConflict`).
 */
export const updateCreationSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  config: creationConfigSchema,
  baseUpdatedAt: z.union([z.string(), z.date()]).optional(),
});

export type UpdateCreationInput = z.infer<typeof updateCreationSchema>;

/**
 * The outcome of a conflict-checked update, returned to the client so the UI can
 * surface a non-destructive warning (Req 2). `status`:
 *   - "saved"    — the update was applied; `row` is the new stored row.
 *   - "conflict" — a NEWER version exists (edited elsewhere since the client
 *                  loaded), so the edit was REFUSED (not overwritten); `row` is
 *                  the current stored row so the UI can show/reload it.
 *   - "notfound" — no owner-matching creation to update.
 */
export type UpdateCreationResult =
  | { status: "saved"; row: CreationRow }
  | { status: "conflict"; row: CreationRow }
  | { status: "notfound" };

/**
 * Pure save-conflict decision (Req 2 — "newer wins with a warning"). No I/O, so
 * it is directly unit-testable.
 *
 * Given the `baseUpdatedAt` the client last loaded and the `storedUpdatedAt`
 * currently in the database, decide whether saving would clobber a concurrent
 * edit. Returns `"conflict"` when the stored row is STRICTLY NEWER than the
 * client's base (someone else saved in between) — the caller must then refuse
 * the overwrite and warn. Otherwise returns `"ok"` (the client is editing the
 * latest version, or a tie, or has no known base) and the save proceeds.
 *
 * Both timestamps may be an ISO `string` (client, post-serialization) or a
 * `Date` (server driver); both normalize to epoch millis. A missing/unparseable
 * base is treated as "no known base" → `"ok"` (never falsely block a save); an
 * unparseable stored value also yields `"ok"` (never block on bad server data).
 */
export function decideSaveConflict(
  baseUpdatedAt: string | Date | null | undefined,
  storedUpdatedAt: string | Date | null | undefined,
): "ok" | "conflict" {
  const baseMs = toMillis(baseUpdatedAt);
  const storedMs = toMillis(storedUpdatedAt);
  if (Number.isNaN(baseMs) || Number.isNaN(storedMs)) return "ok";
  return storedMs > baseMs ? "conflict" : "ok";
}

function toMillis(value: string | Date | null | undefined): number {
  if (value == null) return NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

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
 * Validates a fork/remix request (Item 3): the id of the PUBLIC source creation
 * to copy into a new creation owned by the caller.
 */
export const forkCreationSchema = z.object({
  sourceId: z.string().min(1),
});

export type ForkCreationInput = z.infer<typeof forkCreationSchema>;

/**
 * A creation row as stored in and returned from Postgres (owner-scoped).
 * `created_at` is a `timestamptz` column: the pg/PGLite drivers parse it into a
 * JS `Date` on the server and, once serialized across the server-function
 * boundary, an ISO `string` on the client — typed `string | Date` so both
 * shapes are honest (mirrors FeedbackItem). `updated_at` follows the same
 * `timestamptz` → `string | Date` contract and is the reconciliation key for
 * last-write-wins conflict resolution across devices (Req 2.2/2.3). `featured`
 * is the optional editorial-curation flag (Req 13); it is absent on older rows
 * and on backends/queries that don't project it, so it is optional.
 */
export interface CreationRow {
  id: string;
  user_id: string;
  name: string;
  config: CreationConfig;
  created_at: string | Date;
  updated_at: string | Date;
  is_public: boolean;
  featured?: boolean;
  /**
   * Lineage pointer (Item 3): the id of the creation this one was remixed from,
   * or null/undefined for an original. Absent on older rows / narrow SELECTs.
   */
  parent_id?: string | null;
  /**
   * The source creation's display name, filled only when the parent is still
   * PUBLIC, so the UI can show "Remixed from …". Never set for a private/deleted
   * parent (no PII / no leaking a private name).
   */
  parent_name?: string | null;
}

/**
 * Community library card. Author is a user-chosen display name, or "No name"
 * when they haven't set one. Never an email. `ownerId` is only set on team
 * shelves (signed-in members) so the owner can delete their scene.
 */
export interface LibraryItem {
  id: string;
  name: string;
  config: CreationConfig;
  created_at: string | Date;
  author: string;
  /**
   * The author's user id, so a card can link to their public profile (Item 8).
   * Optional because narrow/older projections (e.g. team shelves) don't select
   * it. Never PII — it is the opaque account id, not an email.
   */
  authorId?: string;
  likeCount: number;
  liked: boolean;
  ownerId?: string;
  /** Lineage (Item 3): the source creation id, when this card is a remix. */
  parentId?: string | null;
  /** The source creation's name, only when the parent is still public. */
  parentName?: string | null;
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
