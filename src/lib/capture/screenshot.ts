/**
 * Browser-only compositing + PNG encoding for canvas screenshots. Kept separate
 * from the pure `composite.ts` dimension math (which is unit-tested headless);
 * everything here touches the DOM/canvas so it is reasoned about, not unit
 * tested. All functions guard on `typeof document` so importing under SSR/node
 * is safe.
 */

/**
 * Composite the engine canvas and the (optional) walls overlay canvas onto a
 * fresh offscreen canvas sized to `size` (from `compositeTargetSize`).
 *
 * The engine canvas is at backing resolution (cssW*dpr × cssH*dpr) while the
 * walls overlay is CSS-sized (clientWidth × clientHeight, no DPR scaling). We
 * draw the engine first, then the walls on top; `drawImage` upscales the walls
 * canvas from its CSS size to the composite (backing) size so the wall lines the
 * user drew line up with what they see on screen.
 *
 * Returns the composite canvas, or null under SSR/node (no document) or if a 2D
 * context can't be obtained.
 */
export function compositeCanvases(
  engineCanvas: HTMLCanvasElement,
  wallsCanvas: HTMLCanvasElement | null,
  size: { width: number; height: number },
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  // Engine layer first (scaled to the composite size — usually 1:1 since size is
  // the engine backing resolution, but compositeTargetSize may clamp very large
  // canvases, in which case drawImage handles the downscale).
  ctx.drawImage(engineCanvas, 0, 0, width, height);
  // Walls overlay on top, upscaled from its CSS resolution to the composite size.
  if (wallsCanvas && wallsCanvas.width > 0 && wallsCanvas.height > 0) {
    ctx.drawImage(wallsCanvas, 0, 0, width, height);
  }
  return out;
}

/**
 * Build a cheap, downscaled JPEG dataURL preview of the current sim for the
 * history timeline (Item 15). Draws the engine canvas (and walls overlay) into a
 * tiny offscreen canvas sized by `thumbSize` and returns a `data:image/jpeg`
 * URL. Returns null under SSR/node, when no engine canvas is available, or if
 * encoding fails — callers fall back to a placeholder tile. Kept intentionally
 * small (see THUMB_MAX_DIM / THUMB_QUALITY) so it is safe to persist in
 * localStorage alongside the version entry.
 */
export function captureThumbnailDataUrl(
  engineCanvas: HTMLCanvasElement | null | undefined,
  wallsCanvas: HTMLCanvasElement | null,
  size: { width: number; height: number },
  quality = 0.6,
): string | null {
  if (typeof document === "undefined" || !engineCanvas) return null;
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  try {
    // Solid backdrop so the JPEG (no alpha) reads as the dark stage, not black
    // fringing where the sim is transparent.
    ctx.fillStyle = "#08090c";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(engineCanvas, 0, 0, width, height);
    if (wallsCanvas && wallsCanvas.width > 0 && wallsCanvas.height > 0) {
      ctx.drawImage(wallsCanvas, 0, 0, width, height);
    }
    return out.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/**
 * Encode a composite canvas to a PNG Blob. Resolves null under SSR/node or if
 * `toBlob` yields nothing.
 */
export function captureScreenshotBlob(
  composite: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg" = "image/png",
  quality = 0.92,
): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise<Blob | null>((resolve) => {
    try {
      composite.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}
