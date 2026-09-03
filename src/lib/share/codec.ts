import { DEFAULT_CAP, DEFAULT_PARAMS } from "@/engine/types";
import {
  normalizeCreationConfig,
  type CreationConfig,
} from "@/lib/creations/types";

type WirePayload = {
  k?: CreationConfig["spawnKind"];
  n?: number;
  s?: CreationConfig["speed"];
  c?: number;
  p?: Partial<CreationConfig["params"]>;
};

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (token.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Compact wire form: only fields that differ from a fresh lab session. */
export function compactPreset(config: CreationConfig): WirePayload {
  const diff: Record<string, unknown> = {};
  const params = config.params;
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof typeof DEFAULT_PARAMS)[]) {
    if (JSON.stringify(params[key]) !== JSON.stringify(DEFAULT_PARAMS[key])) {
      diff[key] = params[key];
    }
  }
  const payload: WirePayload = {};
  if (config.spawnKind !== "galaxy") payload.k = config.spawnKind;
  if (config.spawnCount !== 5000) payload.n = config.spawnCount;
  if (config.speed !== 1) payload.s = config.speed;
  if (config.cap !== DEFAULT_CAP) payload.c = config.cap;
  if (Object.keys(diff).length > 0) payload.p = diff as Partial<CreationConfig["params"]>;
  return payload;
}

export function encodePreset(config: CreationConfig): string {
  return toBase64Url(JSON.stringify(compactPreset(config)));
}

export function decodePreset(token: string): CreationConfig | null {
  if (!token || token.length > 24_000) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as WirePayload;
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeCreationConfig({
      params: { ...DEFAULT_PARAMS, ...(parsed.p ?? {}) },
      spawnKind: parsed.k ?? "galaxy",
      spawnCount: parsed.n ?? 5000,
      speed: parsed.s ?? 1,
      cap: parsed.c ?? DEFAULT_CAP,
    });
  } catch {
    return null;
  }
}

export function shareUrl(config: CreationConfig, origin = ""): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?p=${encodePreset(config)}`;
}

export function embedSnippet(config: CreationConfig, origin = ""): string {
  const src = `${shareUrl(config, origin)}&embed=1`;
  return `<iframe src="${src}" width="800" height="450" style="border:0;border-radius:12px;background:#08090c" allow="fullscreen" loading="lazy" title="Helion Particle Lab"></iframe>`;
}

export function readPresetFromSearch(search: string): CreationConfig | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const token = params.get("p");
  return token ? decodePreset(token) : null;
}

export function isEmbedSearch(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const v = new URLSearchParams(raw).get("embed");
  return v === "1" || v === "true";
}
