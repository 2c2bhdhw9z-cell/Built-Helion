import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * Pure unit tests for the oEmbed payload + iframe builders (Item 10). No I/O.
 *
 * oembed.ts imports `@/lib/share/codec` (for PUBLIC_SHARE_ORIGIN), which only
 * resolves once the shared glob loader is registered; a static top-level import
 * would be hoisted BEFORE register() runs. So the module under test is imported
 * dynamically inside a before() hook, after the loader is active.
 *
 * The live iframe rendering + autoplay is NOT headlessly testable; these tests
 * cover the PURE payload/markup builders and the url→id parser, which is where
 * the correctness (escaping, dimensions, discovery) actually lives.
 */
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

let oembed: typeof import("./oembed.ts");

before(async () => {
  oembed = await import("./oembed.ts");
});

describe("oEmbed builders", () => {
  it("builds a rich oEmbed payload with a correct iframe and dimensions", () => {
    const payload = oembed.buildOEmbed("abc123", { title: "My Scene", origin: "https://example.com" });
    assert.equal(payload.version, "1.0");
    assert.equal(payload.type, "rich");
    assert.equal(payload.provider_name, "Helion");
    assert.equal(payload.provider_url, "https://example.com");
    assert.equal(payload.title, "My Scene");
    assert.equal(payload.width, oembed.EMBED_DEFAULT_WIDTH);
    assert.equal(payload.height, oembed.EMBED_DEFAULT_HEIGHT);
    assert.ok(
      payload.html.includes(`src="https://example.com/embed/abc123"`),
      "iframe src points at the chromeless embed player",
    );
    assert.ok(payload.html.startsWith("<iframe"), "html is an iframe fragment");
    assert.ok(payload.html.includes(`width="${oembed.EMBED_DEFAULT_WIDTH}"`));
  });

  it("HTML-attribute-escapes the id so a crafted id cannot inject markup", () => {
    const evil = `x" onload="alert(1)`;
    const html = oembed.embedIframeHtml(evil, { origin: "https://example.com" });
    // The raw breakout sequence must not survive unescaped.
    assert.ok(!html.includes(`onload="alert(1)"`), "attribute breakout is neutralized");
    // encodeURIComponent in embedUrl already encodes the quote, and the builder
    // additionally HTML-escapes; either way there is no unescaped double quote
    // between the src attribute value.
    assert.ok(html.includes("&quot;") || !html.includes(`"x"`));
  });

  it("clamps dimensions to maxwidth/maxheight preserving 16:9", () => {
    const narrow = oembed.buildOEmbed("id", { maxwidth: 400 });
    assert.equal(narrow.width, 400);
    assert.equal(narrow.height, 225, "16:9 preserved for a 400px width");

    const short = oembed.buildOEmbed("id", { maxheight: 200 });
    assert.ok(short.height <= 200, "height is clamped to maxheight");
    assert.equal(short.width, Math.round((short.height * 800) / 450));
  });

  it("resolves a creation id from both share and embed URLs", () => {
    assert.equal(oembed.creationIdFromUrl("https://helion.app/s/abc"), "abc");
    assert.equal(oembed.creationIdFromUrl("https://helion.app/embed/xyz?foo=1"), "xyz");
    assert.equal(oembed.creationIdFromUrl("https://helion.app/other/abc"), null);
    assert.equal(oembed.creationIdFromUrl("not a url"), null);
  });

  it("embedUrl uses the public share origin by default and encodes the id", () => {
    const url = oembed.embedUrl("a b/c");
    assert.ok(url.endsWith("/embed/a%20b%2Fc"), "id is URL-encoded into the path");
  });

  it("isKnownShareUrl accepts only the public share origin's host, rejects foreign hosts", async () => {
    const codec = await import("../share/codec.ts");
    const knownHost = new URL(codec.PUBLIC_SHARE_ORIGIN).hostname;
    // A url on the real share host (any scheme/port/path) is known.
    assert.equal(oembed.isKnownShareUrl(`https://${knownHost}/s/abc`), true);
    assert.equal(oembed.isKnownShareUrl(`https://${knownHost}/embed/abc?x=1`), true);
    assert.equal(oembed.isKnownShareUrl(`https://${knownHost}:8080/embed/abc`), true);
    // A foreign origin that merely mimics the /s/:id or /embed/:id shape is NOT.
    assert.equal(oembed.isKnownShareUrl("https://evil.example/s/abc"), false);
    assert.equal(oembed.isKnownShareUrl("https://evil.example/embed/abc"), false);
    // A relative / unparseable url is not a known absolute share url.
    assert.equal(oembed.isKnownShareUrl("/s/abc"), false);
    assert.equal(oembed.isKnownShareUrl("not a url"), false);
  });
});
