/** Local XP, badges, daily challenge. Not a server leaderboard. Empty until the user actually does the thing. */

import { kv } from "../platform/storage.ts";

export type BadgeId =
  | "first-spark"
  | "million"
  | "session"
  | "publisher"
  | "recorder"
  | "alchemist"
  | "daily";

export type PlayProgress = {
  xp: number;
  badges: BadgeId[];
  day: string;
  challenge: string;
  challengeDone: boolean;
};

const KEY = "helion.play";

const CHALLENGES = [
  "Create a tornado",
  "Pour a waterfall",
  "Light fireworks",
  "Hold 100,000 particles",
  "Record a clip",
  "Save a checkpoint",
  "Open a live session",
  "Paint with emoji",
];

export const BADGE_COPY: Record<BadgeId, { label: string; hint: string; xp: number }> = {
  "first-spark": { label: "First spark", hint: "Spawn any generator", xp: 20 },
  million: { label: "1M particles", hint: "Raise Count to 1,000,000", xp: 200 },
  session: { label: "Room with a view", hint: "Host or join a session", xp: 80 },
  publisher: { label: "On the shelf", hint: "Publish a creation", xp: 60 },
  recorder: { label: "In motion", hint: "Record video or GIF", xp: 40 },
  alchemist: { label: "Alchemist", hint: "Use Create (AI / image / CSV)", xp: 50 },
  daily: { label: "Daily", hint: "Finish today’s challenge", xp: 30 },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function challengeFor(day: string): string {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 33 + day.charCodeAt(i)) >>> 0;
  return CHALLENGES[h % CHALLENGES.length]!;
}

export function defaultProgress(): PlayProgress {
  const day = today();
  return { xp: 0, badges: [], day, challenge: challengeFor(day), challengeDone: false };
}

export function readProgress(): PlayProgress {
  try {
    const raw = kv().get(KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<PlayProgress>;
    const day = today();
    const badges = Array.isArray(parsed.badges)
      ? parsed.badges.filter((b): b is BadgeId => b in BADGE_COPY)
      : [];
    return {
      xp: typeof parsed.xp === "number" && Number.isFinite(parsed.xp) ? parsed.xp : 0,
      badges,
      day,
      challenge: parsed.day === day && typeof parsed.challenge === "string" ? parsed.challenge : challengeFor(day),
      challengeDone: parsed.day === day ? Boolean(parsed.challengeDone) : false,
    };
  } catch {
    return defaultProgress();
  }
}

function writeProgress(p: PlayProgress): void {
  try {
    kv().set(KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

export function awardBadge(id: BadgeId): PlayProgress {
  const p = readProgress();
  if (p.badges.includes(id)) return p;
  const next: PlayProgress = {
    ...p,
    badges: [...p.badges, id],
    xp: p.xp + BADGE_COPY[id].xp,
  };
  writeProgress(next);
  return next;
}

function completeDaily(): PlayProgress {
  const p = readProgress();
  if (p.challengeDone) return p;
  writeProgress({ ...p, challengeDone: true });
  return awardBadge("daily");
}

/** Auto-complete today's challenge when the matching action happens. No "mark done" cheat. */
export function noteChallenge(event: string): PlayProgress {
  const p = readProgress();
  if (p.challengeDone) return p;
  const c = p.challenge.toLowerCase();
  const e = event.toLowerCase();
  const hit =
    (c.includes("tornado") && e === "tornado") ||
    (c.includes("firework") && e === "fireworks") ||
    (c.includes("waterfall") && (e === "water" || e === "pour")) ||
    (c.includes("100,000") && e === "cap-100k") ||
    (c.includes("record") && (e === "record" || e === "gif")) ||
    (c.includes("checkpoint") && e === "checkpoint") ||
    (c.includes("session") && e === "session") ||
    (c.includes("emoji") && e === "emoji");
  if (!hit) return p;
  return completeDaily();
}

export function addXp(n: number): PlayProgress {
  const p = readProgress();
  const next = { ...p, xp: p.xp + Math.max(0, Math.round(n)) };
  writeProgress(next);
  return next;
}

export function levelFor(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / 100);
}
