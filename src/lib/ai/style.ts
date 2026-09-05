import {
  GENERATOR_KINDS,
  DEFAULT_PARAMS,
  type GeneratorKind,
  type LabParams,
} from "@/engine/types";
import { labParamsSchema } from "@/lib/creations/types";

/**
 * The Style_Mapper (Req 10).
 *
 * This module is PURE: it takes the generator/count the caller wants preserved
 * plus the model's *already-fetched* response and merges them into a coherent,
 * fully-bounded style parameter set. It performs NO network I/O — the xAI
 * provider call lives in `functions.ts` (task 8.5 wires this in). Accepting the
 * model response as an argument keeps the merge/bound logic unit- and
 * property-testable without a network or an API key.
 *
 * A "coherent style set" ALWAYS carries the visual-style fields the design
 * calls out — `palette`, the color trio (`colorA`/`colorB`/`tint`), and
 * `blend` — even when the model omits some of them, by falling back to
 * DEFAULT_PARAMS. Every returned field is coerced through `labParamsSchema`, so
 * each param is guaranteed to sit within the simulator's valid range (Req
 * 10.2). The request's `generator` kind and `spawnCount` are preserved verbatim
 * (Req 10.3, clamped to their valid domains).
 */

/** What the style request preserves: the caller's chosen generator + count. */
export interface StyleRequest {
  generator: GeneratorKind;
  spawnCount: number;
}

/** A successful mapping: a preserved generator/count + a fully-bounded style set. */
export type StyleResult =
  | {
      ok: true;
      generator: GeneratorKind;
      spawnCount: number;
      params: LabParams;
    }
  | { ok: false; error: string };

const KIND_SET = new Set<string>(GENERATOR_KINDS);

/** Spawn-count clamp mirroring the AI entry point's 200..200,000 bounds. */
const SPAWN_MIN = 200;
const SPAWN_MAX = 200_000;

/**
 * Parse an untrusted model response into a plain object, or `null` when it is
 * unparseable. This is the same tolerant extractor used by
 * `src/lib/ai/functions.ts` (strip an optional ```json fence, then take the
 * outermost `{ ... }` span and `JSON.parse` it); an unparseable response yields
 * `null` so `mapStyle` can return an error rather than fabricate params (Req
 * 10.4).
 */
export function parseModelJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const body = fence ? fence[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function preserveKind(raw: GeneratorKind): GeneratorKind {
  return KIND_SET.has(raw) ? raw : "galaxy";
}

function preserveCount(raw: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 8000;
  return Math.max(SPAWN_MIN, Math.min(SPAWN_MAX, Math.round(n)));
}

/**
 * Map a described visual style onto a coherent, fully-bounded parameter set
 * (Req 10). `modelParams` is the model's response — either the raw text to
 * parse (as returned by the xAI call) OR an already-parsed params object; a
 * `null`/`undefined` model response is treated as unparseable.
 *
 * - Merges the model's suggested params over DEFAULT_PARAMS so the result is a
 *   complete style set that ALWAYS includes `palette`, `colorA`/`colorB`/`tint`,
 *   and `blend` (Req 10.1).
 * - Runs the merged set through `labParamsSchema`, so every field is coerced to
 *   the simulator's valid range for that field (Req 10.2).
 * - Preserves the request's `generator` and `spawnCount` (Req 10.3).
 * - Returns `{ ok: false, error }` — never fabricated params — when the model
 *   response cannot be parsed (Req 10.4).
 */
export function mapStyle(
  request: StyleRequest,
  modelParams: string | Record<string, unknown> | null | undefined,
): StyleResult {
  // Resolve the model's suggested params. A string is a raw model response and
  // is parsed with the shared extractor; an unparseable string (or a null/
  // undefined response) is an error — we do NOT fabricate params (Req 10.4).
  let suggested: Record<string, unknown>;
  if (typeof modelParams === "string") {
    const parsed = parseModelJson(modelParams);
    if (!parsed) return { ok: false, error: "Could not read that style" };
    // The model may reply with either a bare params object or an envelope that
    // nests them under `params`; accept both.
    const inner = parsed.params;
    suggested = inner && typeof inner === "object" ? (inner as Record<string, unknown>) : parsed;
  } else if (modelParams && typeof modelParams === "object") {
    suggested = modelParams;
  } else {
    return { ok: false, error: "Could not read that style" };
  }

  // Merge the model's suggestions over the defaults so the style set is always
  // complete (the color/blend/palette fields are present even if the model
  // omitted them), then bound EVERY field through labParamsSchema (Req 10.1,
  // 10.2). `.catch()` on each field coerces anything invalid back to its
  // default, so the parse never throws and the output is always a valid,
  // in-range LabParams.
  const merged = { ...DEFAULT_PARAMS, ...suggested };
  const params = labParamsSchema.parse(merged);

  return {
    ok: true,
    generator: preserveKind(request.generator),
    spawnCount: preserveCount(request.spawnCount),
    params,
  };
}
