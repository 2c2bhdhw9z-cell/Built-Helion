import { test, expect } from "vitest";
import { useLab } from "./lab-store.ts";
import { DEFAULT_PARAMS } from "@/engine/types.ts";
import { normalizeCreationConfig } from "@/lib/creations/types.ts";

test("lab-store initializes with default state", () => {
  const state = useLab.getState();
  expect(state.params).toEqual(DEFAULT_PARAMS);
  expect(state.paused).toBe(false);
  expect(state.speed).toBe(1);
  expect(state.tool).toBe("attract");
  expect(state.tab).toBe("physics");
});

test("lab-store updates specific parameter", () => {
  useLab.getState().setParam("gravityX", 1.5);
  const state = useLab.getState();
  expect(state.params.gravityX).toBe(1.5);
});

test("lab-store updates multiple parameters via patch", () => {
  useLab.getState().patchParams({ gravityY: -1, mass: 2.5 });
  const state = useLab.getState();
  expect(state.params.gravityY).toBe(-1);
  expect(state.params.mass).toBe(2.5);
});

test("lab-store manages brush state", () => {
  useLab.getState().setBrush(0.5, 1.2);
  const state = useLab.getState();
  expect(state.brushRadius).toBe(0.5);
  expect(state.brushStrength).toBe(1.2);
});

test("lab-store sets pointer state", () => {
  useLab.getState().setPointer({ x: 0.1, y: 0.2, down: true });
  const state = useLab.getState();
  expect(state.pointer.x).toBe(0.1);
  expect(state.pointer.y).toBe(0.2);
  expect(state.pointer.down).toBe(true);
});

test("lab-store caps spawn count constraints", () => {
  useLab.getState().setSpawnCount(10); // below min
  expect(useLab.getState().spawnCount).toBe(50);
  
  useLab.getState().setSpawnCount(5_000_000); // above max
  expect(useLab.getState().spawnCount).toBe(1_000_000);
});

test("lab-store clears simulation", () => {
  const initialId = useLab.getState().clearId;
  useLab.getState().clearSim();
  expect(useLab.getState().clearId).toBe(initialId + 1);
});

test("lab-store fill-frame toggle survives resetView", () => {
  useLab.getState().setFillFrame(true);
  expect(useLab.getState().fillFrame).toBe(true);
  useLab.getState().setFillFrame(false);
  expect(useLab.getState().fillFrame).toBe(false);
  useLab.getState().setView({ zoom: 0.4 });
  useLab.getState().resetView();
  expect(useLab.getState().viewZoom).toBe(1);
  expect(useLab.getState().fillFrame).toBe(false);
  useLab.getState().setFillFrame(true);
  expect(useLab.getState().fillFrame).toBe(true);
});

test("lab-store toggles perf hub open state", () => {
  expect(useLab.getState().perfHubOpen).toBe(false);
  useLab.getState().setPerfHubOpen(true);
  expect(useLab.getState().perfHubOpen).toBe(true);
  useLab.getState().setPerfHubOpen(false);
  expect(useLab.getState().perfHubOpen).toBe(false);
});

test("lab-store toggles perf compact mode", () => {
  expect(useLab.getState().perfCompact).toBe(false);
  useLab.getState().setPerfCompact(true);
  expect(useLab.getState().perfCompact).toBe(true);
  useLab.getState().setPerfCompact(false);
  expect(useLab.getState().perfCompact).toBe(false);
});

test("lab-store stores engine system-info reader and clears it", () => {
  expect(useLab.getState().getEngineSystemInfo).toBe(null);
  const reader = () => ({
    backend: "webgl",
    compute: "cpu",
    dpr: 2,
    cssW: 100,
    cssH: 100,
    backingW: 200,
    backingH: 200,
    gl: null,
  });
  useLab.getState().setEngineSystemInfo(reader);
  expect(useLab.getState().getEngineSystemInfo).toBe(reader);
  useLab.getState().setEngineSystemInfo(null);
  expect(useLab.getState().getEngineSystemInfo).toBe(null);
});

test("lab-store triggers generator", () => {
  const initialId = useLab.getState().spawnId;
  useLab.getState().runGenerator("ring");
  const state = useLab.getState();
  expect(state.spawnKind).toBe("ring");
  expect(state.spawnId).toBe(initialId + 1);
});

test("view-only session rejects sim edits", async () => {
  const { useSession } = await import("@/lib/multiplayer/session-store.ts");
  useSession.setState({ role: "view" });
  const spawnId = useLab.getState().spawnId;
  const paused = useLab.getState().paused;
  useLab.getState().runGenerator("galaxy");
  useLab.getState().setPaused(!paused);
  useLab.getState().setTool("repel");
  expect(useLab.getState().spawnId).toBe(spawnId);
  expect(useLab.getState().paused).toBe(paused);
  expect(useLab.getState().tool).toBe("attract");
  useSession.setState({ role: null });
});

test("particle cap is plan-gated (Item 23): free ceiling vs entitled SYSTEM_LIMIT", () => {
  const prev = {
    entitled: useLab.getState().entitled,
    plan: useLab.getState().plan,
    quality: useLab.getState().quality,
    cap: useLab.getState().cap,
    upgradeOpen: useLab.getState().upgradeOpen,
  };
  // Free users can raise the cap freely up to the free ceiling — every quality
  // preset stays under it, so picking "high" never trips the paywall.
  useLab.setState({ entitled: false, plan: "free", quality: "medium", upgradeOpen: false });
  useLab.getState().setQuality("high");
  expect(useLab.getState().cap).toBe(65_536);
  useLab.getState().setCap(90_000);
  expect(useLab.getState().cap).toBe(90_000);
  expect(useLab.getState().upgradeOpen).toBe(false);
  // Asking for more than the free ceiling clamps to it AND opens the upgrade
  // dialog so the paywall is discoverable rather than a silent truncation.
  useLab.getState().setCap(1_000_000);
  expect(useLab.getState().cap).toBe(100_000);
  expect(useLab.getState().upgradeOpen).toBe(true);
  // Entitled (Pro / Enterprise / trial) unlocks the full SYSTEM_LIMIT.
  useLab.getState().setPlan("enterprise");
  useLab.getState().setEntitled(true);
  useLab.getState().setCap(1_000_000);
  expect(useLab.getState().cap).toBe(1_000_000);
  // spawnCount is not plan-gated (only the buffer cap is).
  useLab.getState().setSpawnCount(500_000);
  expect(useLab.getState().spawnCount).toBe(500_000);
  useLab.setState(prev);
});

test("applyCreationConfig clamps a stored audio-mapping amount to 0..2 on load", () => {
  // A crafted/stored config whose amount is far outside the 0..2 range. The
  // schema only checks finiteness, so the 0..2 clamp must be enforced on the
  // load boundary (via normalizeMappings in applyCreationConfig) before the
  // mappings reach the engine.
  const config = normalizeCreationConfig({
    params: { ...DEFAULT_PARAMS },
    spawnKind: "galaxy",
    spawnCount: 5000,
    speed: 1,
    audioMappings: [
      { source: "bass", target: "size", amount: 1000 },
      { source: "level", target: "force", amount: -5 },
    ],
  });
  expect(config).not.toBeNull();
  // amount: 1000 survived the finiteness-only schema.
  expect(config!.audioMappings![0].amount).toBe(1000);

  useLab.getState().applyCreationConfig(config!);
  const mappings = useLab.getState().audioMappings;
  // Amounts clamped into 0..2 on the load path.
  expect(mappings.length).toBe(2);
  expect(mappings[0]).toEqual({ source: "bass", target: "size", amount: 2 });
  expect(mappings[1]).toEqual({ source: "level", target: "force", amount: 0 });
});
