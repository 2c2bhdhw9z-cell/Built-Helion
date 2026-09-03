import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { GENERATOR_KINDS, type GeneratorKind, type LabParams } from "@/engine/types";

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

export const generateLabFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => promptSchema.parse(input))
  .handler(async ({ data }): Promise<AiLabResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available in this environment" };

    const kinds = GENERATOR_KINDS.join(", ");
    const instruction =
      data.mode === "style"
        ? `Map this art style onto Helion particle-lab params. Style: ${data.prompt}`
        : data.mode === "tune"
          ? `Tune Helion physics params for this effect: ${data.prompt}`
          : `Turn this description into a Helion particle-lab scene: ${data.prompt}`;

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
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
    if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseModelJson(text);
    if (!parsed) return { ok: false, error: "Could not read that scene" };
    const spawnCount = Math.max(200, Math.min(200_000, Math.round(Number(parsed.spawnCount) || 8000)));
    return {
      ok: true,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 80) : "AI scene",
      generator: pickKind(parsed.generator),
      spawnCount,
      params: asParams(parsed.params),
    };
  });
