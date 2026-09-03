import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationConfig } from "../creations/types.ts";
import type { LabParams } from "../../engine/types.ts";

register("../feedback/pglite-glob-loader.mjs", import.meta.url);

let encodePreset: typeof import("./codec.ts").encodePreset;
let decodePreset: typeof import("./codec.ts").decodePreset;
let compactPreset: typeof import("./codec.ts").compactPreset;
let embedSnippet: typeof import("./codec.ts").embedSnippet;
let shareUrl: typeof import("./codec.ts").shareUrl;
let isEmbedSearch: typeof import("./codec.ts").isEmbedSearch;
let readPresetFromSearch: typeof import("./codec.ts").readPresetFromSearch;
let isGatedShareHost: typeof import("./codec.ts").isGatedShareHost;
let publicShareOrigin: typeof import("./codec.ts").publicShareOrigin;
let PUBLIC_SHARE_ORIGIN: typeof import("./codec.ts").PUBLIC_SHARE_ORIGIN;
let creationConfigSchema: typeof import("../creations/types.ts").creationConfigSchema;
let DEFAULT_PARAMS: LabParams;

before(async () => {
  const codec = await import("./codec.ts");
  encodePreset = codec.encodePreset;
  decodePreset = codec.decodePreset;
  compactPreset = codec.compactPreset;
  embedSnippet = codec.embedSnippet;
  shareUrl = codec.shareUrl;
  isEmbedSearch = codec.isEmbedSearch;
  readPresetFromSearch = codec.readPresetFromSearch;
  isGatedShareHost = codec.isGatedShareHost;
  publicShareOrigin = codec.publicShareOrigin;
  PUBLIC_SHARE_ORIGIN = codec.PUBLIC_SHARE_ORIGIN;
  const types = await import("../creations/types.ts");
  creationConfigSchema = types.creationConfigSchema;
  const engine = await import("../../engine/types.ts");
  DEFAULT_PARAMS = engine.DEFAULT_PARAMS;
});

const sample = (): CreationConfig =>
  creationConfigSchema.parse({
    params: { ...DEFAULT_PARAMS, gravityY: -0.4, trails: true, palette: "ember", tint: "#ff8844" },
    spawnKind: "fire",
    spawnCount: 8000,
    speed: 2,
    cap: 32768,
  });

describe("preset codec", () => {
  it("round-trips a compact fire preset", () => {
    const config = sample();
    const token = encodePreset(config);
    assert.ok(token.length > 8);
    assert.ok(!token.includes("+") && !token.includes("/"));
    const decoded = decodePreset(token);
    assert.ok(decoded);
    assert.equal(decoded!.spawnKind, "fire");
    assert.equal(decoded!.spawnCount, 8000);
    assert.equal(decoded!.speed, 2);
    assert.equal(decoded!.params.gravityY, -0.4);
    assert.equal(decoded!.params.trails, true);
    assert.equal(decoded!.params.palette, "ember");
    assert.equal(decoded!.params.tint, "#ff8844");
  });

  it("omits default fields from the wire payload", () => {
    const config = creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
    });
    const compact = compactPreset(config);
    assert.equal(compact.k, undefined);
    assert.equal(compact.n, undefined);
    assert.equal(compact.p, undefined);
    assert.ok(encodePreset(config).length < 12);
  });

  it("rejects garbage tokens", () => {
    assert.equal(decodePreset(""), null);
    assert.equal(decodePreset("%%%not-base64"), null);
    assert.equal(decodePreset(encodePreset(sample()).slice(0, 4)), null);
  });

  it("builds share and embed URLs", () => {
    const url = shareUrl(sample(), "https://helion.example");
    assert.match(url, /^https:\/\/helion\.example\/\?p=/);
    const iframe = embedSnippet(sample(), "https://helion.example");
    assert.match(iframe, /embed=1/);
    assert.match(iframe, /<iframe /);
  });

  it("reads p= from a query string and detects embed", () => {
    const token = encodePreset(sample());
    const loaded = readPresetFromSearch(`?p=${token}&embed=1`);
    assert.ok(loaded);
    assert.equal(loaded!.spawnKind, "fire");
    assert.equal(isEmbedSearch("?embed=1"), true);
    assert.equal(isEmbedSearch(""), false);
  });

  it("treats Grok / xAI wrapper hosts as gated", () => {
    assert.equal(isGatedShareHost("foo.grok-sandbox.com"), true);
    assert.equal(isGatedShareHost("grok.com"), true);
    assert.equal(isGatedShareHost("accounts.x.ai"), true);
    assert.equal(isGatedShareHost("auth.grok.me"), true);
    assert.equal(isGatedShareHost("built-helion.vercel.app"), false);
    assert.equal(isGatedShareHost("localhost"), false);
  });

  it("rewrites gated origins to the public lab", () => {
    const gated = publicShareOrigin("https://abc.grok-sandbox.com");
    assert.equal(gated, PUBLIC_SHARE_ORIGIN);
    const url = shareUrl(sample(), "https://abc.grok-sandbox.com");
    assert.ok(url.startsWith(`${PUBLIC_SHARE_ORIGIN}/?p=`));
    assert.equal(publicShareOrigin("https://built-helion.vercel.app"), "https://built-helion.vercel.app");
    assert.equal(publicShareOrigin("https://helion.example"), "https://helion.example");
  });
});
