import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cachedKv, kv, newMemoryKv, setKvStore, type AsyncKvStore } from "./storage.ts";
import { copyText, setCopyText } from "./clipboard.ts";
import { saveBlob, setSaveBlob } from "./files.ts";
import { runtimeKind } from "./runtime.ts";
import { shareOrCopy } from "./share.ts";

describe("platform kv", () => {
  it("memory store round-trips and starts empty", () => {
    const mem = newMemoryKv();
    setKvStore(mem);
    assert.equal(kv().get("missing"), null);
    kv().set("helion.test", "1");
    assert.equal(kv().get("helion.test"), "1");
    kv().remove("helion.test");
    assert.equal(kv().get("helion.test"), null);
  });

  it("cachedKv hydrates from seed and flushes writes to the async backend", async () => {
    const remote = new Map<string, string>();
    const backend: AsyncKvStore = {
      get: async (key) => remote.get(key) ?? null,
      set: async (key, value) => {
        remote.set(key, value);
      },
      remove: async (key) => {
        remote.delete(key);
      },
    };
    const store = cachedKv(backend, { "helion.seed": "from-disk" });
    assert.equal(store.get("helion.seed"), "from-disk");
    assert.equal(store.get("missing"), null);
    store.set("helion.next", "2");
    store.remove("helion.seed");
    await Promise.resolve();
    assert.equal(remote.get("helion.next"), "2");
    assert.equal(remote.has("helion.seed"), false);
    assert.equal(store.get("helion.seed"), null);
  });
});

describe("platform runtime", () => {
  it("is web when no native bridge is present", () => {
    assert.equal(runtimeKind(), "web");
  });

  it("reports capacitor only when Capacitor says the platform is native", () => {
    const g = globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    const prev = g.Capacitor;
    g.Capacitor = { isNativePlatform: () => true };
    try {
      assert.equal(runtimeKind(), "capacitor");
    } finally {
      if (prev === undefined) delete g.Capacitor;
      else g.Capacitor = prev;
    }
    assert.equal(runtimeKind(), "web");
  });

  it("reports tauri when the Tauri internals global exists", () => {
    const g = globalThis as unknown as { __TAURI_INTERNALS__?: unknown };
    const prev = g.__TAURI_INTERNALS__;
    g.__TAURI_INTERNALS__ = {};
    try {
      assert.equal(runtimeKind(), "tauri");
    } finally {
      if (prev === undefined) delete g.__TAURI_INTERNALS__;
      else g.__TAURI_INTERNALS__ = prev;
    }
    assert.equal(runtimeKind(), "web");
  });
});

describe("platform save / copy plug-in points", () => {
  it("setSaveBlob is what a native shell swaps in", async () => {
    const names: string[] = [];
    setSaveBlob(async (filename) => {
      names.push(filename);
    });
    try {
      await saveBlob("still.png", new Blob(["x"]));
      assert.deepEqual(names, ["still.png"]);
    } finally {
      setSaveBlob(null);
    }
  });

  it("setCopyText is what a native clipboard plugin swaps in", async () => {
    const copied: string[] = [];
    setCopyText(async (text) => {
      copied.push(text);
      return true;
    });
    try {
      assert.equal(await copyText("hello"), true);
      assert.deepEqual(copied, ["hello"]);
    } finally {
      setCopyText(null);
    }
  });

  it("shareOrCopy copies when there is no share sheet", async () => {
    setCopyText(async () => true);
    try {
      assert.equal(await shareOrCopy("Helion", "https://example.test/s/1"), "copied");
    } finally {
      setCopyText(null);
    }
  });
});
