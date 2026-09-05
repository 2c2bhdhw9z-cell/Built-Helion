import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { GENERATOR_KINDS, type GeneratorKind, type LabParams } from "@/engine/types";
import { runTuner } from "@/lib/ai/tuner";
import { mapStyle } from "@/lib/ai/style";
import { scoreCandidate, type AiObjective, type Candidate } from "@/lib/ai/objective";

const promptSchema = z.object({
  prompt: z.string().trim().min(2).max(400),
  mode: z.enum(["create", "style", "tune"]).default("create"),
});

export type AiLabResult = {
  ok: true;
  name: string;
  generator: GeneratorKind;
  spawnCount: number;
  params: Partial<LabParams>;
} | { ok: false; error: string };

const KIND_SET = new Set<string>(GENERATOR_KINDS);

function pickKind(raw: unknown): GeneratorKind {
  if (typeof raw === "string" && KIND_SET.has(raw)) return raw as GeneratorKind;
  return "galaxy";
}

function asParams(raw: unknown): Partial<LabParams> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Partial<LabParams>;
}

function parseModelJson(text: string): Record<string, unknown> | null {
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

/** Clamp a spawn count into the AI entry point's 200..200,000 bounds. */
function clampSpawnCount(raw: unknown): number {
  return Math.max(200, Math.min(200_000, Math.round(Number(raw) || 8000)));
}

/**
 * Derive a prompt-driven optimization objective for the closed-loop tuner
 * (Req 9.1). This is a deliberately simple, deterministic keyword mapping: the
 * prompt is lowercased and scanned for descriptor cues, each of which nudges a
 * normalized `[0, 1]` target on the {@link AiObjective}. It performs NO I/O and
 * is pure over its input, so the `tune` branch's objective (and therefore the
 * tuner's climb) is fully reproducible for a given prompt. Descriptors with no
 * matching cue are left `undefined`, so `scoreCandidate` ignores them.
 */
function deriveObjective(prompt: string): AiObjective {
  const text = prompt.toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  const objective: AiObjective = {};

  if (has("energetic", "energy", "explosive", "explosion", "fast", "intense", "powerful", "violent", "burst"))
    objective.energy = 0.9;
  else if (has("calm", "gentle", "slow", "soft", "still", "serene", "peaceful"))
    objective.energy = 0.15;

  if (has("turbulent", "turbulence", "chaotic", "chaos", "swirl", "swirling", "storm", "stormy", "vortex", "whirl", "wild"))
    objective.turbulence = 0.9;
  else if (has("smooth", "laminar", "orderly", "steady", "flowing"))
    objective.turbulence = 0.15;

  if (has("bright", "glow", "glowing", "luminous", "radiant", "neon", "shiny", "shining", "dazzling", "bloom"))
    objective.brightness = 0.9;
  else if (has("dark", "dim", "muted", "shadow", "shadowy", "faint"))
    objective.brightness = 0.15;

  if (has("dense", "density", "packed", "thick", "cohesive", "clustered", "cluster", "tight", "crowded"))
    objective.density = 0.9;
  else if (has("sparse", "diffuse", "scattered", "spread", "thin", "loose", "airy"))
    objective.density = 0.15;

  return objective;
}

/**
 * The xAI provider's one-shot response, parsed into the pieces every mode
 * consumes: a display name, the model's suggested generator/count, and the
 * suggested params (both as a partial LabParams object and as the raw text, so
 * the style mapper can re-parse if it prefers). Returns `{ ok: false }` with a
 * user-facing error when the key is missing, the API errors, or the response
 * is unparseable — the caller NEVER fabricates params on failure (Reqs 9.5, 10.4).
 */
type ProviderResult =
  | {
      ok: true;
      name: string;
      generator: GeneratorKind;
      spawnCount: number;
      params: Partial<LabParams>;
      raw: Record<string, unknown>;
    }
  | { ok: false; error: string };

async function callProvider(prompt: string, mode: "create" | "style" | "tune"): Promise<ProviderResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI is not available in this environment" };

  const kinds = GENERATOR_KINDS.join(", ");
  const instruction =
    mode === "style"
      ? `Map this art style onto Helion particle-lab params. Style: ${prompt}`
      : mode === "tune"
        ? `Tune Helion physics params for this effect: ${prompt}`
        : `Turn this description into a Helion particle-lab scene: ${prompt}`;

  let res: Response;
  try {
    res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 500,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `You configure Helion Particle Lab. Reply with JSON only, no markdown.
Schema: {"name": string, "generator": one of [${kinds}], "spawnCount": 200-200000, "params": partial LabParams}.
Useful params: gravityX, gravityY, drag, mass, lifespan, pointSize, shape, blend, palette, colorMap, trails, trailDecay, bloom, bloomStrength, sph, flock, nbody, flow, flowStrength, background, tint, emoji, forceKind, forceStrength, forceExprX, forceExprY, colorA, colorB.
Shapes: circle, square, ring, diamond, triangle, star, hex, plus, heart, spark, emoji, sprite.
Force kinds: off, radial, swirl, sine, expr.
Palettes: rainbow, ember, ice, aurora, solar, mono, plasma.
Color maps: life, speed, density, mass, palette, position.
Backgrounds: void, starfield, gradient, nebula, image, video.`,
          },
          { role: "user", content: instruction },
        ],
      }),
    });
  } catch {
    return { ok: false, error: "AI provider is unavailable" };
  }

  if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  const parsed = parseModelJson(text);
  if (!parsed) return { ok: false, error: "Could not read that scene" };

  return {
    ok: true,
    name:
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim().slice(0, 80)
        : "AI scene",
    generator: pickKind(parsed.generator),
    spawnCount: clampSpawnCount(parsed.spawnCount),
    params: asParams(parsed.params),
    raw: parsed,
  };
}

export const generateLabFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => promptSchema.parse(input))
  .handler(async ({ data }): Promise<AiLabResult> => {
    // Every mode starts from the provider's one-shot guess. A missing key,
    // API error, or unparseable response short-circuits to an error result so
    // that NO mode ever fabricates params (Reqs 9.5, 10.4).
    const provider = await callProvider(data.prompt, data.mode);
    if (!provider.ok) return provider;

    // create — unchanged one-shot behavior: hand back the provider's guess.
    if (data.mode === "create") {
      return {
        ok: true,
        name: provider.name,
        generator: provider.generator,
        spawnCount: provider.spawnCount,
        params: provider.params,
      };
    }

    // tune — closed-loop optimize the provider's starting candidate toward a
    // prompt-derived objective, scoring with the pure objective (Req 9.1).
    if (data.mode === "tune") {
      const objective = deriveObjective(data.prompt);
      const seed: Candidate = provider.params;
      const tuned = runTuner({
        prompt: data.prompt,
        seed,
        evaluate: (candidate) => scoreCandidate(objective, candidate),
      });
      return {
        ok: true,
        name: provider.name,
        generator: provider.generator,
        spawnCount: provider.spawnCount,
        params: tuned.params,
      };
    }

    // style — map the provider's suggested params into a coherent, fully-bounded
    // style set, preserving the provider's generator + count (Req 10). An
    // unparseable model response surfaces as an error (Req 10.4).
    const styled = mapStyle(
      { generator: provider.generator, spawnCount: provider.spawnCount },
      provider.params,
    );
    if (!styled.ok) return { ok: false, error: styled.error };
    return {
      ok: true,
      name: provider.name,
      generator: styled.generator,
      spawnCount: styled.spawnCount,
      params: styled.params,
    };
  });
