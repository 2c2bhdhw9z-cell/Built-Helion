import type { CreationConfig } from "@/lib/creations/types";
import { brushMode, IDLE_EXTRA_BRUSH, type ExtraBrush, type GeneratorKind, type LabParams, type ToolKind } from "@/engine/types";
import type { SpeedMul } from "@/store/lab-store";
import type { SessionRole } from "./session-store";

export const MAX_SESSION_PEERS = 8;

const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomRoomCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ALPH[b % ALPH.length];
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function sessionUrl(code: string, origin = ""): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?session=${code}`;
}

export function readSessionFromSearch(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const token = new URLSearchParams(raw).get("session");
  if (!token) return null;
  const code = normalizeRoomCode(token);
  return code.length >= 4 ? code : null;
}

export function writeSessionQuery(code: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("session", code);
  else url.searchParams.delete("session");
  const next = url.pathname + url.search + url.hash;
  window.history.replaceState(null, "", next);
}

const CURSOR_COLORS = [
  "#8ec8c3",
  "#7dba8a",
  "#c4a574",
  "#d4726a",
  "#8eb4d4",
  "#b8a58c",
  "#9aa3b8",
  "#c98980",
];

export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length]!;
}

const GUEST_KEY = "helion.guestName";

function storageGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function randomGuestName(): string {
  const buf = new Uint8Array(2);
  crypto.getRandomValues(buf);
  const a = ALPH[buf[0]! % ALPH.length];
  const b = ALPH[buf[1]! % ALPH.length];
  return `Guest ${a}${b}`;
}

export function readGuestName(): string {
  const raw = storageGet(GUEST_KEY);
  if (!raw) return "";
  return raw.trim().slice(0, 32);
}

export function writeGuestName(name: string): string {
  const next = name.trim().slice(0, 32);
  if (next) storageSet(GUEST_KEY, next);
  return next;
}

export function ensureGuestName(fallback?: string): string {
  const existing = readGuestName();
  if (existing) return existing;
  const next = (fallback && fallback.trim().slice(0, 32)) || randomGuestName();
  writeGuestName(next);
  return next;
}

const LIVE_STALE_MS = 400;

export function pickLiveExtraBrush(
  cursors: Iterable<{ x: number; y: number; down: boolean; at: number; tool?: ToolKind }>,
  brushStrength: number,
  brushRadius: number,
  now = Date.now(),
): ExtraBrush {
  let best: { x: number; y: number; tool?: ToolKind; at: number } | null = null;
  for (const c of cursors) {
    if (!c.down || now - c.at > LIVE_STALE_MS) continue;
    if (!best || c.at >= best.at) best = c;
  }
  if (!best) return IDLE_EXTRA_BRUSH;
  return {
    x: best.x,
    y: best.y,
    force: brushStrength,
    radius: brushRadius,
    mode: brushMode(best.tool ?? "attract", true),
  };
}

export type LiveMsg = {
  t: "live";
  x: number;
  y: number;
  down: boolean;
  tool: ToolKind;
  name: string;
};

export type SnapshotMsg = {
  t: "snapshot";
  config: CreationConfig;
  paused: boolean;
  speed: SpeedMul;
  tool: ToolKind;
  brushRadius: number;
  brushStrength: number;
  pouring: boolean;
  falling: boolean;
  firing: boolean;
  smoking: boolean;
  hostId: string;
  roles: Record<string, SessionRole>;
};

export type GenMsg = {
  t: "gen";
  kind: GeneratorKind;
  config: CreationConfig;
};

export type ParamsMsg = { t: "params"; params: LabParams };
export type ClearMsg = { t: "clear" };
export type ToolMsg = {
  t: "tool";
  tool: ToolKind;
  brushRadius: number;
  brushStrength: number;
};
export type PausedMsg = { t: "paused"; v: boolean };
export type SpeedMsg = { t: "speed"; v: SpeedMul };
export type StreamsMsg = {
  t: "streams";
  pouring: boolean;
  falling: boolean;
  firing: boolean;
  smoking: boolean;
};
export type RoleMsg = { t: "role"; peerId: string; role: SessionRole };
export type ChatMsg = { t: "chat"; text: string; name: string; at: number };
export type HelloMsg = { t: "hello"; name: string; isHost: boolean };

export type SessionMsg =
  | LiveMsg
  | SnapshotMsg
  | GenMsg
  | ParamsMsg
  | ClearMsg
  | ToolMsg
  | PausedMsg
  | SpeedMsg
  | StreamsMsg
  | RoleMsg
  | ChatMsg
  | HelloMsg;

export function isSessionMsg(data: unknown): data is SessionMsg {
  return Boolean(data && typeof data === "object" && "t" in data && typeof (data as { t: unknown }).t === "string");
}
