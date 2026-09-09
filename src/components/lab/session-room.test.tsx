import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "./test-render";

// Regression guard for the SessionRoom effect-stability bug: its effects key on
// the STABLE members of the P2PRoom handle (send / onMessage / onTrack /
// broadcast, which are useCallback-stable) rather than the parent `p2p` object,
// whose identity changes every render. When they depended on `p2p`, every
// unrelated re-render tore down and re-registered the message/track listeners
// and restarted the broadcast RAF loop — the same "keyed on an unstable object"
// class of bug as the refetch loop.
//
// We mock the P2PRoom binding with STABLE callbacks (as useP2PRoom guarantees)
// and assert the listeners are registered once and survive re-renders.

const onMessage = vi.fn(() => () => {});
const onTrack = vi.fn(() => () => {});
const send = vi.fn();
const broadcast = vi.fn();
const setLocalAudio = vi.fn();

// The handle object is rebuilt each render (new identity) but its callbacks are
// the SAME references — exactly what useP2PRoom returns via useCallback/useRef.
vi.mock("@/lib/multiplayer/use-p2p-room", () => ({
  useP2PRoom: () => ({
    selfId: "p-self",
    room: "ROOM1",
    peers: [],
    joined: true,
    broadcast,
    send,
    onMessage,
    onTrack,
    setLocalAudio,
  }),
}));

vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({
    user: { id: "u1", displayName: "Nova", primaryEmail: null, profileImageUrl: null, isDevFallback: false },
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  // requestAnimationFrame is used by the cursor-broadcast loop; keep it from
  // actually scheduling in happy-dom (return a handle, never invoke).
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadSessionRoom() {
  return (await import("./session-room")).SessionRoom;
}

describe("SessionRoom effect stability", () => {
  test("registers the message and track listeners exactly once on mount", async () => {
    const SessionRoom = await loadSessionRoom();
    const { unmount } = mount(<SessionRoom code="ROOM1" isHost />);
    try {
      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onTrack).toHaveBeenCalledTimes(1);
      // Announces itself once via the reliable channel (a host is not a spectator).
      expect(send).toHaveBeenCalledWith({
        t: "hello",
        name: "Nova",
        isHost: true,
        spectator: false,
      });
    } finally {
      unmount();
    }
  });

  test("does NOT re-register listeners on unrelated re-renders", async () => {
    const SessionRoom = await loadSessionRoom();
    const { rerender, unmount } = mount(<SessionRoom code="ROOM1" isHost />);
    try {
      const msgBefore = onMessage.mock.calls.length;
      const trackBefore = onTrack.mock.calls.length;
      const rafBefore = (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock.calls
        .length;
      // Re-render with identical props (the handle's identity changes, its
      // callbacks do not). The listeners must not be torn down/re-added.
      rerender(<SessionRoom code="ROOM1" isHost />);
      rerender(<SessionRoom code="ROOM1" isHost />);
      expect(onMessage.mock.calls.length).toBe(msgBefore);
      expect(onTrack.mock.calls.length).toBe(trackBefore);
      // The cursor broadcast loop keys on the stable broadcast fn, so it is not
      // restarted either.
      expect(
        (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBe(rafBefore);
    } finally {
      unmount();
    }
  });

  test("renders nothing (headless session controller)", async () => {
    const SessionRoom = await loadSessionRoom();
    const { container, unmount } = mount(<SessionRoom code="ROOM1" isHost={false} />);
    try {
      expect(container.textContent).toBe("");
    } finally {
      unmount();
    }
  });
});
