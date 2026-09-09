import { PUBLIC_SHARE_ORIGIN } from "@/lib/share/codec";

/**
 * Pure oEmbed payload + embed-iframe builders (Item 10). No I/O and no DOM, so
 * they are directly unit-testable. The API route (src/routes/api/oembed.ts) and
 * the embed snippet reuse these so the iframe markup and the discovery payload
 * never drift apart.
 *
 * oEmbed spec: https://oembed.com — we emit the "rich" type (an HTML fragment).
 */

/** Default embed dimensions (16:9), overridable via the oEmbed maxwidth/height. */
export const EMBED_DEFAULT_WIDTH = 800;
export const EMBED_DEFAULT_HEIGHT = 450;

/** oEmbed provider identity. */
export const OEMBED_PROVIDER_NAME = "Helion";

/**
 * Escape a string for safe interpolation into an HTML attribute value. Guards
 * the iframe `src` (which contains the creation id) against attribute-breakout
 * / injection: `"`, `'`, `&`, `<`, `>` are all entity-encoded.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Strip a trailing slash from an origin so URL joins stay clean. */
function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * The public URL of the chromeless embed player for a creation. Uses the public
 * share origin (unsigned-openable) so the iframe never lands on a Grok-gated
 * host. The id is URL-encoded so an exotic id can't break the path.
 */
export function embedUrl(id: string, origin: string = PUBLIC_SHARE_ORIGIN): string {
  return `${stripSlash(origin)}/embed/${encodeURIComponent(id)}`;
}

/**
 * Build the `<iframe>` HTML fragment that embeds a creation's read-only player.
 * The `src` id is HTML-attribute-escaped so a crafted id cannot inject markup.
 */
export function embedIframeHtml(
  id: string,
  opts: { width?: number; height?: number; origin?: string } = {},
): string {
  const width = opts.width ?? EMBED_DEFAULT_WIDTH;
  const height = opts.height ?? EMBED_DEFAULT_HEIGHT;
  const src = escapeHtmlAttribute(embedUrl(id, opts.origin));
  return (
    `<iframe src="${src}" width="${width}" height="${height}" ` +
    `style="border:0;border-radius:12px;background:#08090c" ` +
    `allow="fullscreen; accelerometer; gyroscope" loading="lazy" ` +
    `title="Helion Particle Lab"></iframe>`
  );
}

/** The oEmbed "rich" response payload. */
export interface OEmbedPayload {
  version: "1.0";
  type: "rich";
  provider_name: string;
  provider_url: string;
  title: string;
  html: string;
  width: number;
  height: number;
}

/**
 * Build the oEmbed "rich" payload for a creation. `maxwidth`/`maxheight` (from
 * the oEmbed consumer) clamp the iframe dimensions while preserving the 16:9
 * aspect ratio; a missing/invalid value falls back to the defaults.
 */
export function buildOEmbed(
  id: string,
  opts: {
    title?: string;
    origin?: string;
    maxwidth?: number;
    maxheight?: number;
  } = {},
): OEmbedPayload {
  const origin = opts.origin ?? PUBLIC_SHARE_ORIGIN;
  let width = EMBED_DEFAULT_WIDTH;
  let height = EMBED_DEFAULT_HEIGHT;
  if (typeof opts.maxwidth === "number" && Number.isFinite(opts.maxwidth) && opts.maxwidth > 0) {
    width = Math.min(width, Math.floor(opts.maxwidth));
    height = Math.round((width * EMBED_DEFAULT_HEIGHT) / EMBED_DEFAULT_WIDTH);
  }
  if (typeof opts.maxheight === "number" && Number.isFinite(opts.maxheight) && opts.maxheight > 0) {
    if (height > opts.maxheight) {
      height = Math.floor(opts.maxheight);
      width = Math.round((height * EMBED_DEFAULT_WIDTH) / EMBED_DEFAULT_HEIGHT);
    }
  }
  return {
    version: "1.0",
    type: "rich",
    provider_name: OEMBED_PROVIDER_NAME,
    provider_url: stripSlash(origin),
    title: opts.title?.trim() || "Helion creation",
    html: embedIframeHtml(id, { width, height, origin }),
    width,
    height,
  };
}

/**
 * Parse the `id` a consumer wants oEmbed for out of a `url` query param. Accepts
 * both a share URL (…/s/:id) and an embed URL (…/embed/:id), returning the id or
 * null when the URL doesn't match a known creation path. Pure — used by the API
 * route to resolve the target from the standard oEmbed `url` parameter.
 */
export function creationIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = /\/(?:s|embed)\/([^/?#]+)/.exec(u.pathname);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}
