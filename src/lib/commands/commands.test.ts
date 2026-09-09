import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  canonicalizeBinding,
  eventToBinding,
  formatBinding,
  normalizeKeyToken,
} from "./keys.ts";
import type {
  CommandStore,
  LabCommand,
} from "./registry.ts";

// registry.ts imports @/engine/scenes; the @/ alias is resolved by the shared
// loader, but a STATIC import of registry.ts would be hoisted and resolved
// before register() runs. So we register the loader, then dynamically import
// the registry inside before(). keys.ts is pure (no @/ imports) so it stays
// static.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type Registry = typeof import("./registry.ts");
let buildCommands: Registry["buildCommands"];
let commandForBinding: Registry["commandForBinding"];
let findDuplicateBindings: Registry["findDuplicateBindings"];
let findDuplicateIds: Registry["findDuplicateIds"];
let keyedCommands: Registry["keyedCommands"];
let commands: LabCommand[];

before(async () => {
  const reg = await import("./registry.ts");
  buildCommands = reg.buildCommands;
  commandForBinding = reg.commandForBinding;
  findDuplicateBindings = reg.findDuplicateBindings;
  findDuplicateIds = reg.findDuplicateIds;
  keyedCommands = reg.keyedCommands;
  commands = buildCommands({ toggleFullscreen: () => {} });
});

describe("keybinding normalization (pure)", () => {
  it("collapses letter case and space aliases", () => {
    assert.equal(normalizeKeyToken("Z"), "z");
    assert.equal(normalizeKeyToken(" "), "space");
    assert.equal(normalizeKeyToken("Spacebar"), "space");
  });

  it("treats = as + and _ as -", () => {
    assert.equal(normalizeKeyToken("="), "+");
    assert.equal(normalizeKeyToken("_"), "-");
  });

  it("canonicalizes modifier order so authoring order does not matter", () => {
    assert.equal(canonicalizeBinding("Shift+Mod+Z"), "mod+shift+z");
    assert.equal(canonicalizeBinding("mod+shift+z"), "mod+shift+z");
    assert.equal(canonicalizeBinding("Ctrl+Y"), "mod+y");
  });

  it("maps cmd/ctrl/meta all to mod", () => {
    assert.equal(canonicalizeBinding("cmd+z"), "mod+z");
    assert.equal(canonicalizeBinding("ctrl+z"), "mod+z");
    assert.equal(canonicalizeBinding("meta+z"), "mod+z");
  });

  it("expresses the literal plus key", () => {
    assert.equal(canonicalizeBinding("mod++"), "mod++");
    assert.equal(canonicalizeBinding("+"), "+");
  });
});

describe("eventToBinding (pure)", () => {
  it("builds mod+shift+z from a ctrl+shift+Z event", () => {
    assert.equal(
      eventToBinding({ key: "Z", ctrlKey: true, shiftKey: true }),
      "mod+shift+z",
    );
  });

  it("uses code Space for the space bar", () => {
    assert.equal(eventToBinding({ key: " ", code: "Space" }), "space");
  });

  it("meta maps to mod (mac Cmd)", () => {
    assert.equal(eventToBinding({ key: "z", metaKey: true }), "mod+z");
  });

  it("bare digit and ? pass through", () => {
    assert.equal(eventToBinding({ key: "6" }), "6");
    assert.equal(eventToBinding({ key: "?" }), "?");
  });
});

describe("formatBinding (pure)", () => {
  it("renders mac glyphs", () => {
    assert.equal(formatBinding("mod+shift+z", true), "⌘⇧Z");
    assert.equal(formatBinding("space", true), "Space");
  });
  it("renders non-mac words", () => {
    assert.equal(formatBinding("mod+shift+z", false), "Ctrl+Shift+Z");
  });
});

describe("command registry integrity (pure)", () => {
  it("has no duplicate ids", () => {
    assert.deepEqual(findDuplicateIds(commands), []);
  });

  it("has no duplicate keybindings", () => {
    assert.deepEqual(findDuplicateBindings(commands), []);
  });

  it("keyedCommands returns only the bound subset", () => {
    const keyed = keyedCommands(commands);
    assert.ok(keyed.length > 0);
    assert.ok(keyed.every((c) => c.keys && c.keys.length > 0));
    // Palette-only commands (e.g. tool select) must be excluded.
    assert.ok(!keyed.some((c) => c.id === "tools.select-attract"));
  });
});

describe("keybinding lookup resolves to the right command", () => {
  const cases: [string, string][] = [
    ["space", "playback.toggle-pause"],
    ["1", "playback.speed-0.25"],
    ["3", "playback.speed-1"],
    ["5", "playback.speed-4"],
    ["0", "view.reset"],
    ["+", "view.zoom-in"],
    ["mod++", "view.zoom-in"],
    ["-", "view.zoom-out"],
    ["f", "view.fullscreen"],
    ["[", "view.quality-down"],
    ["]", "view.quality-up"],
    ["mod+z", "edit.undo"],
    ["mod+shift+z", "edit.redo"],
    ["mod+y", "edit.redo"],
    ["?", "help.shortcuts"],
  ];
  for (const [binding, id] of cases) {
    it(`${binding} -> ${id}`, () => {
      assert.equal(commandForBinding(commands, binding)?.id, id);
    });
  }

  it("scenes 6-9 resolve to scene commands", () => {
    for (const k of ["6", "7", "8", "9"]) {
      const c = commandForBinding(commands, k);
      assert.ok(c, `binding ${k} resolves`);
      assert.ok(c!.id.startsWith("generate.scene-"));
    }
  });

  it("an unbound key resolves to null", () => {
    assert.equal(commandForBinding(commands, "q"), null);
  });
});

describe("commands run against the store", () => {
  function makeStore(over: Partial<CommandStore> = {}): CommandStore & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      paused: false,
      speed: 1,
      quality: "high",
      viewZoom: 1,
      helpOpen: false,
      canUndo: true,
      canRedo: true,
      timelineOpen: false,
      captureScreenshot: (() => calls.push("screenshot")) as CommandStore["captureScreenshot"],
      setPaused: (v) => calls.push(`pause:${v}`),
      setSpeed: (v) => calls.push(`speed:${v}`),
      setQuality: (q) => calls.push(`quality:${q}`),
      resetView: () => calls.push("resetView"),
      setView: (v) => calls.push(`view:${v.zoom}`),
      setHelpOpen: (v) => calls.push(`help:${v}`),
      undo: () => calls.push("undo"),
      redo: () => calls.push("redo"),
      applyScene: (id) => calls.push(`scene:${id}`),
      runGenerator: (k) => calls.push(`gen:${k}`),
      setTool: (t) => calls.push(`tool:${t}`),
      clearSim: () => calls.push("clear"),
      setCreationsOpen: (v) => calls.push(`creations:${v}`),
      setLibraryOpen: (v) => calls.push(`library:${v}`),
      setHistoryOpen: (v) => calls.push(`history:${v}`),
      setDailyOpen: (v) => calls.push(`daily:${v}`),
      setCreateOpen: (v) => calls.push(`create:${v}`),
      setPlayOpen: (v) => calls.push(`play:${v}`),
      setDeveloperOpen: (v) => calls.push(`developer:${v}`),
      setPerfHubOpen: (v) => calls.push(`perf:${v}`),
      setTimelineOpen: (v) => calls.push(`timeline:${v}`),
      ...over,
    };
  }

  it("space toggles pause from the current state", () => {
    const s = makeStore({ paused: true });
    commandForBinding(commands, "space")!.run(s);
    assert.deepEqual(s.calls, ["pause:false"]);
  });

  it("undo/redo dispatch the store actions", () => {
    const s = makeStore();
    commandForBinding(commands, "mod+z")!.run(s);
    commandForBinding(commands, "mod+y")!.run(s);
    assert.deepEqual(s.calls, ["undo", "redo"]);
  });

  it("undo is disabled when canUndo is false", () => {
    const s = makeStore({ canUndo: false });
    const undo = commands.find((c) => c.id === "edit.undo")!;
    assert.equal(undo.enabled?.(s), false);
  });

  it("a generator command runs its generator", () => {
    const s = makeStore();
    commands.find((c) => c.id === "generate.run-galaxy")!.run(s);
    assert.deepEqual(s.calls, ["gen:galaxy"]);
  });

  it("a tool command selects its tool", () => {
    const s = makeStore();
    commands.find((c) => c.id === "tools.select-vortex")!.run(s);
    assert.deepEqual(s.calls, ["tool:vortex"]);
  });

  it("the fullscreen command invokes the injected side-effect", () => {
    let fs = 0;
    const cmds = buildCommands({ toggleFullscreen: () => (fs += 1) });
    commandForBinding(cmds, "f")!.run(makeStore());
    assert.equal(fs, 1);
  });
});
