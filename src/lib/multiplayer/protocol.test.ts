import { expect, test } from "vitest";
import { IDLE_EXTRA_BRUSH } from "@/engine/types";
import {
  ensureGuestName,
  isSessionMsg,
  normalizeRoomCode,
  pickLiveExtraBrush,
  randomRoomCode,
  readGuestName,
  readSessionFromSearch,
  writeGuestName,
} from "./protocol";

test("random room codes are 6 alphanumerics", () => {
  const code = randomRoomCode();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  expect(code).not.toMatch(/[01ILO]/);
});

test("normalizeRoomCode strips junk and uppercases", () => {
  expect(normalizeRoomCode(" ab-c12 ")).toBe("ABC12");
  expect(normalizeRoomCode("toolongcodehere")).toBe("TOOLONGC");
});

test("readSessionFromSearch pulls a valid code", () => {
  expect(readSessionFromSearch("?session=ABC12X&embed=1")).toBe("ABC12X");
  expect(readSessionFromSearch("session=no")).toBe(null);
  expect(readSessionFromSearch("")).toBe(null);
});

test("guest names persist and stay short", () => {
  localStorage.removeItem("helion.guestName");
  const first = ensureGuestName();
  expect(first.startsWith("Guest ")).toBe(true);
  expect(readGuestName()).toBe(first);
  expect(writeGuestName("  Nova  ")).toBe("Nova");
  expect(ensureGuestName()).toBe("Nova");
  expect(writeGuestName("x".repeat(80)).length).toBe(32);
});

test("pickLiveExtraBrush uses the newest down cursor", () => {
  const now = 1_000_000;
  expect(pickLiveExtraBrush([], 0.85, 0.12, now)).toEqual(IDLE_EXTRA_BRUSH);
  const extra = pickLiveExtraBrush(
    [
      { x: 0.2, y: 0.2, down: true, at: now - 20, tool: "repel" },
      { x: 0.7, y: 0.4, down: true, at: now - 5, tool: "attract" },
      { x: 0.9, y: 0.9, down: false, at: now, tool: "vortex" },
      { x: 0.1, y: 0.1, down: true, at: now - 800, tool: "attract" },
    ],
    0.9,
    0.15,
    now,
  );
  expect(extra.x).toBe(0.7);
  expect(extra.y).toBe(0.4);
  expect(extra.mode).toBe(1);
  expect(extra.force).toBe(0.9);
  expect(extra.radius).toBe(0.15);
});

test("kick is a session message", () => {
  expect(isSessionMsg({ t: "kick", peerId: "p-1" })).toBe(true);
  expect(isSessionMsg({ t: "hello", name: "Nova", isHost: true })).toBe(true);
});
