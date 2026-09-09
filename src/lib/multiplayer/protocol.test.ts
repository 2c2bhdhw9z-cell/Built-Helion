import { expect, test } from "vitest";
import { IDLE_EXTRA_BRUSH } from "@/engine/types";
import { kv } from "../platform/storage";
import {
  decideReconnect,
  ensureGuestName,
  isSessionMsg,
  normalizeRoomCode,
  pickLiveExtraBrush,
  randomRoomCode,
  readGuestName,
  readSessionFromSearch,
  readSpectateFromSearch,
  spectatorUrl,
  writeGuestName,
  type ReconnectContext,
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

test("readSpectateFromSearch only trips with a valid code AND the flag", () => {
  // View-only spectator entry (Item 11): flag alone with no session code is
  // nothing to watch, and a code without the flag is a normal edit join.
  expect(readSpectateFromSearch("?session=ABC12X&spectate=1")).toBe(true);
  expect(readSpectateFromSearch("?session=ABC12X&spectate=true")).toBe(true);
  expect(readSpectateFromSearch("?session=ABC12X")).toBe(false);
  expect(readSpectateFromSearch("?session=ABC12X&spectate=0")).toBe(false);
  expect(readSpectateFromSearch("?spectate=1")).toBe(false);
  expect(readSpectateFromSearch("")).toBe(false);
});

test("spectatorUrl appends the spectate flag to the session link", () => {
  const url = spectatorUrl("ABC12X", "https://helion.test");
  expect(url).toBe("https://helion.test/?session=ABC12X&spectate=1");
  // Round-trips: opening the built link is recognized as a spectator join.
  const search = url.slice(url.indexOf("?"));
  expect(readSpectateFromSearch(search)).toBe(true);
  expect(readSessionFromSearch(search)).toBe("ABC12X");
});

test("guest names persist and stay short", () => {
  kv().remove("helion.guestName");
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

const RC: ReconnectContext = {
  state: "failed",
  wasConnected: true,
  recoveryAttempts: 0,
  maxAttempts: 3,
  isDialer: true,
};

test("decideReconnect ignores a pair that never connected", () => {
  // A pair still doing its first handshake is handled by normal negotiation
  // and the stall watchdog, not the connected→dropped reconnect path.
  expect(decideReconnect({ ...RC, wasConnected: false })).toBe("none");
  expect(decideReconnect({ ...RC, wasConnected: false, state: "disconnected" })).toBe("none");
});

test("decideReconnect ignores non-drop states", () => {
  for (const state of ["new", "connecting", "connected", "closed"] as const) {
    expect(decideReconnect({ ...RC, state })).toBe("none");
  }
});

test("decideReconnect rebuilds on the dialer when a connected pair fails", () => {
  expect(decideReconnect({ ...RC, state: "failed", isDialer: true })).toBe("rebuild");
});

test("decideReconnect waits on the receiver when a connected pair fails", () => {
  // Only the dialer re-dials; the receiver waits for the fresh offer.
  expect(decideReconnect({ ...RC, state: "failed", isDialer: false })).toBe("wait");
});

test("decideReconnect restarts ICE in place for a transient disconnect", () => {
  // A blip (phone sleep/wake) should try to self-heal before spending a
  // rebuild attempt — and it does so on both sides.
  expect(decideReconnect({ ...RC, state: "disconnected", isDialer: true })).toBe("restart-ice");
  expect(decideReconnect({ ...RC, state: "disconnected", isDialer: false })).toBe("restart-ice");
});

test("decideReconnect gives up once attempts hit the ceiling (no storm)", () => {
  // A genuinely NAT-blocked pair must not reconnect-storm.
  expect(decideReconnect({ ...RC, recoveryAttempts: 3, maxAttempts: 3 })).toBe("none");
  expect(
    decideReconnect({ ...RC, state: "disconnected", recoveryAttempts: 3, maxAttempts: 3 }),
  ).toBe("none");
  expect(decideReconnect({ ...RC, recoveryAttempts: 5, maxAttempts: 3 })).toBe("none");
});

test("decideReconnect still acts while attempts remain under the ceiling", () => {
  expect(decideReconnect({ ...RC, recoveryAttempts: 2, maxAttempts: 3 })).toBe("rebuild");
});
