import { z } from "zod";
import { DEFAULT_CAP, DEFAULT_PARAMS } from "@/engine/types";
import {
  creationConfigSchema,
  normalizeCreationConfig,
  type CreationConfig,
} from "@/lib/creations/types";

/**
 * Client-safe daily-challenge model + the PURE deterministic seed generator.
 *
 * This file MUST stay free of any server-only imports (no @/lib/db, no
 * server.ts) so the browser bundle, the challenge UI, the public route loader,
 * and the server functions can all import it. All DB access lives in
 * ./server.ts, imported dynamically inside the server-fn handlers.
 *
 * A "daily challenge" is a deterministic seed CONFIG derived purely from the
 * calendar day (via {@link seedForDate}), so today's seed is reproducible with
 * NO cron: the server fn lazily materializes today's row (a real, loadable
 * public creation) the first time it is asked for. Entries are the public
 * creations forked from that seed (batch-A `parent_id` lineage), ranked by
 * likes.
 */

/** The palette ids a seed may pick (mirrors PaletteId in engine/types). */
const SEED_PALETTES = [
  "rainbow",
  "ember",
  "ice",
  "aurora",
  "solar",
  "plasma",
] as const;

/**
 * The subset of generator kinds a seed may pick. Deliberately excludes the
 * Pro-only generators so an unsigned visitor can always load and remix the
 * seed. These are the free base generators from GENERATOR_KINDS.
 */
export const SEED_GENERATORS = [
  "galaxy",
  "ring",
  "burst",
  "pour",
  "fall",
  "flock",
  "nbody",
  "fire",
  "smoke",
  "fireworks",
  "water",
  "tornado",
  "supernova",
  "fibonacci",
] as const;

/**
 * UTC date key (YYYY-MM-DD) for a Date, or the string itself when already a
 * key. This is the `daily_challenges.day` primary key: exactly one seed per
 * calendar day. Using UTC keeps the key stable regardless of server timezone.
 */
export function dayKey(when: Date | string = new Date()): string {
  if (typeof when === "string") {
    // Accept a YYYY-MM-DD (or ISO) string; normalize to the date portion.
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(when.trim());
    if (m) return m[1];
    const parsed = new Date(when);
    return Number.isNaN(parsed.getTime()) ? "1970-01-01" : parsed.toISOString().slice(0, 10);
  }
  return when.toISOString().slice(0, 10);
}

/**
 * Deterministic 32-bit hash (FNV-1a) of a string. Pure and stable across
 * runs/platforms, so the same day always hashes to the same seed. Not for
 * security — just a spread so consecutive days pick visibly different scenes.
 */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // FNV prime multiply, kept in 32-bit unsigned range.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A small deterministic PRNG (mulberry32) seeded from a 32-bit integer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an element from a list deterministically using a 0..1 sample. */
function pick<T>(list: readonly T[], sample: number): T {
  const i = Math.min(list.length - 1, Math.floor(sample * list.length));
  return list[i]!;
}

/**
 * PURE deterministic seed-of-the-day generator (Item 7).
 *
 * Given a calendar day (a Date or a YYYY-MM-DD key), returns a complete, valid,
 * loadable {@link CreationConfig} — the SAME config for the SAME day, every
 * time, on every machine, with no I/O. The day string is hashed and used to
 * seed a small PRNG that picks a free generator kind, a palette, a bounded
 * particle count, and a couple of visual params. The result is run through
 * `creationConfigSchema` so it is always a schema-valid config (the same
 * validation the share link and save path use), never a hand-rolled object
 * that could drift from the schema.
 */
export function seedForDate(when: Date | string = new Date()): CreationConfig {
  const key = dayKey(when);
  const rand = mulberry32(hashString(`helion-daily:${key}`));

  const spawnKind = pick(SEED_GENERATORS, rand());
  const palette = pick(SEED_PALETTES, rand());
  // Bounded, human-friendly particle count (10k..90k), rounded to a round 1k.
  const spawnCount = Math.round((10_000 + Math.floor(rand() * 80_000)) / 1000) * 1000;
  const trails = rand() > 0.5;
  const bloom = rand() > 0.6;
  const pointSize = Number((1.8 + rand() * 2.6).toFixed(2));

  const raw = {
    params: {
      ...DEFAULT_PARAMS,
      palette,
      trails,
      trailDecay: 0.14,
      trailLength: 0.9,
      bloom,
      bloomStrength: 1.6,
      pointSize,
      colorMap: "palette" as const,
    },
    spawnKind,
    spawnCount,
    speed: 1 as const,
    cap: DEFAULT_CAP,
  };
  // Always yields a valid config (all fields are defaulted/coerced), but
  // normalize defensively so the return type is a real CreationConfig.
  return normalizeCreationConfig(raw) ?? creationConfigSchema.parse({});
}

/** A public, PII-free daily-challenge summary (the seed itself). */
export interface DailyChallenge {
  day: string;
  title: string;
  config: CreationConfig;
  /** The real, loadable public creation entries fork from. */
  seedCreationId: string;
}

/**
 * A single ranked board entry: a public creation forked from today's seed. This
 * is a PII-free projection — author is a display name (or "No name"), never an
 * email.
 */
export interface DailyBoardEntry {
  id: string;
  name: string;
  author: string;
  likeCount: number;
  config: CreationConfig;
}

/** Validates a board-listing request (the optional day key; defaults to today). */
export const dailyBoardSchema = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type DailyBoardInput = z.infer<typeof dailyBoardSchema>;
