/**
 * Single source-of-truth command registry (Item 16).
 *
 * Every keyboard shortcut AND every command-palette entry is one `LabCommand`.
 * The canvas keydown handler dispatches from the same list the palette renders,
 * and the help overlay lists the keyed subset, so shortcuts, palette, and help
 * can never drift out of sync.
 *
 * `run` receives the lab store's actions object (the value of `useLab.getState()`),
 * so this module stays free of React and can be exercised in a unit test with a
 * plain stub — the pure parts we test are: unique ids, no duplicate keybindings,
 * and that a given key resolves to the intended command.
 */
import { SCENES, type SceneId } from "@/engine/scenes";
import type { GeneratorKind, ToolKind } from "@/engine/types";
import { canonicalizeBinding } from "./keys.ts";

/** The store surface a command needs. Structurally satisfied by the lab store. */
export type CommandStore = {
  paused: boolean;
  speed: number;
  quality: "low" | "medium" | "high";
  viewZoom: number;
  helpOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setPaused: (v: boolean) => void;
  setSpeed: (v: 0.25 | 0.5 | 1 | 2 | 4) => void;
  setQuality: (q: "low" | "medium" | "high") => void;
  resetView: () => void;
  setView: (v: { zoom?: number }) => void;
  setHelpOpen: (v: boolean) => void;
  undo: () => void;
  redo: () => void;
  applyScene: (id: SceneId) => void;
  runGenerator: (kind: GeneratorKind) => void;
  setTool: (t: ToolKind) => void;
  clearSim: () => void;
  setCreationsOpen: (v: boolean) => void;
  setLibraryOpen: (v: boolean) => void;
  setHistoryOpen: (v: boolean) => void;
  setDailyOpen: (v: boolean) => void;
  setCreateOpen: (v: boolean) => void;
  setPlayOpen: (v: boolean) => void;
  setDeveloperOpen: (v: boolean) => void;
  setPerfHubOpen: (v: boolean) => void;
  setTimelineOpen: (v: boolean) => void;
  timelineOpen: boolean;
  captureScreenshot: ((kind?: "png" | "jpg") => void) | null;
};

export type CommandGroup =
  | "Playback"
  | "View"
  | "Edit"
  | "Generate"
  | "Tools"
  | "Panels"
  | "Help";

export type LabCommand = {
  /** Stable unique id (also the palette React key). */
  id: string;
  /** Human label shown in the palette and help overlay. */
  label: string;
  group: CommandGroup;
  /**
   * Optional canonical keybinding (see keys.ts). Commands without a binding are
   * palette-only (navigational). A command may declare several bindings that all
   * trigger it (e.g. "+" and "mod++" for zoom in) via `keys`.
   */
  keys?: string[];
  /** Extra search terms for the palette fuzzy match. */
  keywords?: string;
  /** Whether the command should currently be enabled (palette dims it if false). */
  enabled?: (s: CommandStore) => boolean;
  /** Execute the command against the store. */
  run: (s: CommandStore) => void;
};

const TOOL_LABELS: { id: ToolKind; label: string }[] = [
  { id: "attract", label: "Attract" },
  { id: "repel", label: "Repel" },
  { id: "repulsor", label: "Repulsor" },
  { id: "vortex", label: "Vortex" },
  { id: "paint", label: "Paint" },
  { id: "wall", label: "Wall" },
  { id: "field", label: "Field" },
  { id: "freeze", label: "Freeze" },
];

const PALETTE_GENERATORS: { id: GeneratorKind; label: string }[] = [
  { id: "galaxy", label: "Galaxy" },
  { id: "ring", label: "Ring" },
  { id: "burst", label: "Burst" },
  { id: "pour", label: "Pour" },
  { id: "fall", label: "Fall" },
  { id: "flock", label: "Flock" },
  { id: "cloth", label: "Cloth" },
  { id: "nbody", label: "N-body" },
  { id: "fire", label: "Fire" },
  { id: "smoke", label: "Smoke" },
  { id: "fireworks", label: "Fireworks" },
];

/**
 * Build the full command list. Bindings mirror the pre-refactor canvas handler
 * EXACTLY: Space=pause, 1-5=speed, 0=reset view, +/-=zoom, F=fullscreen,
 * ?=help, [ ]=quality, 6-9=scenes, mod+z/mod+shift+z/mod+y=undo/redo.
 *
 * `fullscreen` needs the DOM, so it is provided by the caller (the canvas stage)
 * as an injected side-effect; the registry stays DOM-free otherwise.
 */
export function buildCommands(opts: { toggleFullscreen: () => void }): LabCommand[] {
  const cmds: LabCommand[] = [
    {
      id: "playback.toggle-pause",
      label: "Play / pause",
      group: "Playback",
      keys: ["space"],
      keywords: "resume stop",
      run: (s) => s.setPaused(!s.paused),
    },
    ...([0.25, 0.5, 1, 2, 4] as const).map((mul, i) => ({
      id: `playback.speed-${mul}`,
      label: `Speed ${mul}×`,
      group: "Playback" as const,
      keys: [String(i + 1)],
      run: (s: CommandStore) => s.setSpeed(mul),
    })),
    {
      id: "view.reset",
      label: "Reset view",
      group: "View",
      keys: ["0"],
      keywords: "center zoom pan rotate",
      run: (s) => s.resetView(),
    },
    {
      id: "view.zoom-in",
      label: "Zoom in",
      group: "View",
      keys: ["+", "mod++"],
      run: (s) => s.setView({ zoom: s.viewZoom * 1.12 }),
    },
    {
      id: "view.zoom-out",
      label: "Zoom out",
      group: "View",
      keys: ["-"],
      run: (s) => s.setView({ zoom: s.viewZoom / 1.12 }),
    },
    {
      id: "view.fullscreen",
      label: "Toggle fullscreen",
      group: "View",
      keys: ["f"],
      run: () => opts.toggleFullscreen(),
    },
    {
      id: "view.quality-down",
      label: "Lower quality",
      group: "View",
      keys: ["["],
      keywords: "performance detail",
      run: (s) => s.setQuality(s.quality === "high" ? "medium" : "low"),
    },
    {
      id: "view.quality-up",
      label: "Raise quality",
      group: "View",
      keys: ["]"],
      keywords: "performance detail",
      run: (s) => s.setQuality(s.quality === "low" ? "medium" : "high"),
    },
    {
      id: "edit.undo",
      label: "Undo",
      group: "Edit",
      keys: ["mod+z"],
      enabled: (s) => s.canUndo,
      run: (s) => s.undo(),
    },
    {
      id: "edit.redo",
      label: "Redo",
      group: "Edit",
      keys: ["mod+shift+z", "mod+y"],
      enabled: (s) => s.canRedo,
      run: (s) => s.redo(),
    },
    {
      id: "edit.clear",
      label: "Clear the sim",
      group: "Edit",
      keywords: "reset empty wipe",
      run: (s) => s.clearSim(),
    },
    {
      id: "help.shortcuts",
      label: "Keyboard shortcuts",
      group: "Help",
      keys: ["?"],
      keywords: "keys help overlay",
      run: (s) => s.setHelpOpen(!s.helpOpen),
    },
  ];

  // Scenes 6-9 map to the first four SCENES, matching the old handler.
  SCENES.slice(0, 4).forEach((scene, i) => {
    cmds.push({
      id: `generate.scene-${scene.id}`,
      label: `Scene: ${scene.label}`,
      group: "Generate",
      keys: [String(i + 6)],
      keywords: "scene preset",
      run: (s) => s.applyScene(scene.id),
    });
  });

  // Remaining scenes are palette-only (no keybinding).
  SCENES.slice(4).forEach((scene) => {
    cmds.push({
      id: `generate.scene-${scene.id}`,
      label: `Scene: ${scene.label}`,
      group: "Generate",
      keywords: "scene preset",
      run: (s) => s.applyScene(scene.id),
    });
  });

  // Palette-only generator runs.
  for (const g of PALETTE_GENERATORS) {
    cmds.push({
      id: `generate.run-${g.id}`,
      label: `Generate ${g.label}`,
      group: "Generate",
      keywords: "spawn create particles",
      run: (s) => s.runGenerator(g.id),
    });
  }

  // Palette-only tool selection.
  for (const t of TOOL_LABELS) {
    cmds.push({
      id: `tools.select-${t.id}`,
      label: `Tool: ${t.label}`,
      group: "Tools",
      keywords: "brush interact",
      run: (s) => s.setTool(t.id),
    });
  }

  // Palette-only dialog/panel navigation.
  const panels: { id: string; label: string; open: (s: CommandStore) => void }[] = [
    { id: "creations", label: "Open Creations", open: (s) => s.setCreationsOpen(true) },
    { id: "library", label: "Open Library", open: (s) => s.setLibraryOpen(true) },
    { id: "history", label: "Open History", open: (s) => s.setHistoryOpen(true) },
    { id: "daily", label: "Open Daily challenge", open: (s) => s.setDailyOpen(true) },
    { id: "create", label: "Open Create (text / image / CSV)", open: (s) => s.setCreateOpen(true) },
    { id: "play", label: "Open Play (challenges)", open: (s) => s.setPlayOpen(true) },
    { id: "developer", label: "Open Developer API", open: (s) => s.setDeveloperOpen(true) },
    { id: "perf", label: "Open Performance hub", open: (s) => s.setPerfHubOpen(true) },
  ];
  for (const p of panels) {
    cmds.push({
      id: `panel.open-${p.id}`,
      label: p.label,
      group: "Panels",
      keywords: "dialog open window",
      run: p.open,
    });
  }
  cmds.push({
    id: "panel.toggle-timeline",
    label: "Toggle keyframe timeline",
    group: "Panels",
    keywords: "animation keyframes",
    run: (s) => s.setTimelineOpen(!s.timelineOpen),
  });
  cmds.push({
    id: "edit.screenshot",
    label: "Take a screenshot (PNG)",
    group: "Edit",
    keywords: "capture export image png",
    enabled: (s) => Boolean(s.captureScreenshot),
    run: (s) => s.captureScreenshot?.("png"),
  });

  return cmds.map((c) => (c.keys ? { ...c, keys: c.keys.map(canonicalizeBinding) } : c));
}

/**
 * Resolve a canonical keybinding to the command that owns it, or null. Pure —
 * takes the already-canonicalized event binding (from eventToBinding).
 */
export function commandForBinding(
  commands: LabCommand[],
  binding: string,
): LabCommand | null {
  for (const c of commands) {
    if (c.keys?.includes(binding)) return c;
  }
  return null;
}

/** The keyed subset, for the help overlay. Preserves registry order. */
export function keyedCommands(commands: LabCommand[]): LabCommand[] {
  return commands.filter((c) => c.keys && c.keys.length > 0);
}

/**
 * Validation helpers for the unit test (and a dev-time safety net): every id is
 * unique and no keybinding is claimed by two commands.
 */
export function findDuplicateIds(commands: LabCommand[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const c of commands) {
    if (seen.has(c.id)) dups.push(c.id);
    seen.add(c.id);
  }
  return dups;
}

export function findDuplicateBindings(commands: LabCommand[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const c of commands) {
    for (const k of c.keys ?? []) {
      if (seen.has(k)) dups.push(k);
      seen.add(k);
    }
  }
  return dups;
}
