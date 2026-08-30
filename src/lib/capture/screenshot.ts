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
 * Encode a composite canvas to a PNG Blob. Resolves null under SSR/node or if
 * `toBlob` yields nothing.
 */
export function captureScreenshotBlob(
  composite: HTMLCanvasElement,
): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise<Blob | null>((resolve) => {
    try {
      composite.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}
