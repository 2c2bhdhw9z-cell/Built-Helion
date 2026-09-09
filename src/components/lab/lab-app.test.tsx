import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "./test-render";

// Regression guard for the usage-flush interval bug in LabApp: the 15s
// setInterval keys on the STABLE `userId` (user?.id), NOT the `user` object,
// which useCurrentUserState() rebuilds on every render. When it keyed on the
// object literal, any unrelated re-render (menu toggle, session update, Better
// Auth session refetch) tore down and recreated the interval, restarting its
// 15s countdown so lab time never accrued on a busy screen.
//
// LabApp pulls in the whole lab surface (engine/canvas, dialogs, stores), so we
// mock the heavy leaf modules to null and drive the real effect wiring. The
// assertion is behavioral: re-rendering with a NEW user object of the SAME id
// must NOT create a second interval.

// A fresh object literal every call, same id — reproduces the exact shape that
// made the object-keyed dependency unstable.
let currentUserId: string | null = "user-1";
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({
    user: currentUserId
      ? {
          id: currentUserId,
          displayName: "Nova",
          primaryEmail: null,
          profileImageUrl: null,
          isDevFallback: false,
        }
      : null,
    isPending: false,
  }),
}));

// Heavy / DOM-hungry children rendered by LabApp — replace with null so the
// component mounts under happy-dom without a real engine or dialogs.
const nullComponent = () => null;
vi.mock("./canvas-stage", () => ({ CanvasStage: nullComponent }));
vi.mock("./hud", () => ({ Hud: nullComponent }));
vi.mock("./menus", () => ({
  GeneratorBar: nullComponent,
  ParamDock: nullComponent,
  ToolBar: nullComponent,
}));
vi.mock("./feedback-dialog", () => ({ FeedbackDialog: nullComponent }));
vi.mock("./feedback-board", () => ({ FeedbackBoard: nullComponent }));
vi.mock("./creations-dialog", () => ({ CreationsDialog: nullComponent }));
vi.mock("./library-dialog", () => ({ LibraryDialog: nullComponent }));
vi.mock("./profile-dialog", () => ({ ProfileDialog: nullComponent }));
vi.mock("./upgrade-dialog", () => ({ UpgradeDialog: nullComponent }));
vi.mock("./history-dialog", () => ({ HistoryDialog: nullComponent }));
vi.mock("./developer-dialog", () => ({ DeveloperDialog: nullComponent }));
vi.mock("./create-dialog", () => ({ CreateDialog: nullComponent }));
vi.mock("./play-dialog", () => ({ PlayDialog: nullComponent }));
vi.mock("./theme-sync", () => ({ BillingSync: nullComponent }));
vi.mock("./perf-hub/perf-hub", () => ({ PerfHub: nullComponent }));
vi.mock("./session-dialog", () => ({ SessionDialog: nullComponent }));
vi.mock("./session-room", () => ({ SessionRoom: nullComponent }));

// Dynamic imports fired from effects — stub so they don't touch analytics/net.
vi.mock("@/lib/play/analytics", () => ({
  takeDelta: () => ({}),
  addSeconds: vi.fn(),
  hasDelta: () => false,
}));
vi.mock("@/lib/play/progress", () => ({
  awardBadge: vi.fn(),
  noteChallenge: vi.fn(),
}));
vi.mock("@/lib/usage/functions", () => ({ flushUsageFn: vi.fn() }));

// matchMedia is used by the layout effect; happy-dom lacks it.
beforeEach(() => {
  currentUserId = "user-1";
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function loadLabApp() {
  return (await import("./lab-app")).LabApp;
}

describe("LabApp usage-flush interval", () => {
  test("registers exactly one 15s interval on mount", async () => {
    const LabApp = await loadLabApp();
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const { unmount } = mount(<LabApp />);
    try {
      const fifteenSec = setInterval.mock.calls.filter(([, ms]) => ms === 15_000);
      expect(fifteenSec.length).toBe(1);
    } finally {
      unmount();
    }
  });

  test("does NOT recreate the interval on an unrelated re-render (stable userId)", async () => {
    const LabApp = await loadLabApp();
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const clearInterval = vi.spyOn(globalThis, "clearInterval");
    const { rerender, unmount } = mount(<LabApp />);
    try {
      const before = setInterval.mock.calls.filter(([, ms]) => ms === 15_000).length;
      // Re-render for an "unrelated" reason. useCurrentUserState() hands back a
      // brand-new user object each render, but the id is unchanged — the effect
      // keys on the id, so the interval must survive.
      rerender(<LabApp />);
      rerender(<LabApp />);
      const after = setInterval.mock.calls.filter(([, ms]) => ms === 15_000).length;
      expect(after).toBe(before);
      // And it was not torn down and rebuilt either.
      expect(clearInterval).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("re-arms the interval only when the user id actually changes", async () => {
    const LabApp = await loadLabApp();
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const { rerender, unmount } = mount(<LabApp />);
    try {
      const before = setInterval.mock.calls.filter(([, ms]) => ms === 15_000).length;
      currentUserId = "user-2";
      rerender(<LabApp />);
      const after = setInterval.mock.calls.filter(([, ms]) => ms === 15_000).length;
      // A genuine identity change (sign in/out) SHOULD re-arm the interval.
      expect(after).toBe(before + 1);
    } finally {
      unmount();
    }
  });
});
