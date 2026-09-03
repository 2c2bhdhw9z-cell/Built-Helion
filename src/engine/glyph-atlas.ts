/** Size of the GPU glyph texture. Power-of-two; bytesPerRow = size*4 must be a multiple of 256 for WebGPU. */
export const GLYPH_ATLAS_SIZE = 128;

export type GlyphRaster = {
  data: Uint8Array;
  size: number;
  hasPixels: boolean;
};

let host: HTMLCanvasElement | null = null;
let hostCtx: CanvasRenderingContext2D | null = null;
let fontsHooked = false;
const fontListeners = new Set<() => void>();

const FONT_PX = Math.floor(GLYPH_ATLAS_SIZE * 0.78);
const FONT_STACK = `${FONT_PX}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;

function ensureHost(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!host) {
    host = document.createElement("canvas");
    host.width = GLYPH_ATLAS_SIZE;
    host.height = GLYPH_ATLAS_SIZE;
    host.setAttribute("aria-hidden", "true");
    // Keep the atlas in the viewport (iOS skips fillText of color emoji on
    // canvases that are display:none / off-document) but under the lab so it
    // never shows as a ghost glyph in the corner.
    host.style.cssText =
      "position:fixed;left:0;top:0;width:128px;height:128px;opacity:1;pointer-events:none;z-index:-1;";
  }
  if (!host.isConnected && document.body) document.body.appendChild(host);
  if (!hostCtx) {
    hostCtx = host.getContext("2d", { willReadFrequently: true, alpha: true });
  }
  if (!fontsHooked && document.fonts) {
    fontsHooked = true;
    void document.fonts.ready.then(() => {
      for (const cb of fontListeners) cb();
    });
  }
  return hostCtx;
}

/** Call when color-emoji fonts finish loading so GPU atlases can re-bake. */
export function onGlyphFontsReady(cb: () => void): () => void {
  fontListeners.add(cb);
  if (typeof document !== "undefined" && document.fonts?.status === "loaded") cb();
  return () => {
    fontListeners.delete(cb);
  };
}

function snapshot(ctx: CanvasRenderingContext2D): GlyphRaster {
  const s = GLYPH_ATLAS_SIZE;
  const img = ctx.getImageData(0, 0, s, s);
  const data = new Uint8Array(s * s * 4);
  data.set(img.data);
  let hasPixels = false;
  for (let i = 3; i < data.length; i += 16) {
    if (data[i]! > 10 || data[i + 4]! > 10 || data[i + 8]! > 10 || data[i + 12]! > 10) {
      hasPixels = true;
      break;
    }
  }
  return { data, size: s, hasPixels };
}

/**
 * Rasterize a single glyph/emoji into a 128×128 RGBA snapshot.
 * GPU backends cannot fillText, so this is sampled as a POINT/quad sprite.
 * Returns a copied buffer so the host canvas can be reused immediately.
 */
export function rasterizeGlyph(ch: string): GlyphRaster | null {
  const ctx = ensureHost();
  if (!ctx || !host) return null;
  const s = GLYPH_ATLAS_SIZE;
  const text = ch && ch.trim() ? ch.trim() : "\u2728";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "copy";
  ctx.clearRect(0, 0, s, s);
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = FONT_STACK;
  ctx.imageSmoothingEnabled = true;

  // Do NOT set fillStyle first — a white fill turns color emoji into
  // silhouettes on iOS. Native color glyphs ignore fillStyle.
  ctx.fillText(text, s / 2, s / 2 + s * 0.03);
  let raster = snapshot(ctx);

  if (!raster.hasPixels) {
    // Dingbats / missing color font: draw as a white glyph so the GPU
    // still has coverage instead of discarding every fragment.
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, s / 2, s / 2 + s * 0.03);
    raster = snapshot(ctx);
  }
  return raster;
}
