/** Backing resolution of the engine canvas. */
export type EngineSize = {
  width: number;
  height: number;
};

/** Target size for the offscreen composite/export canvas, plus applied scale. */
export type CompositeSize = {
  width: number;
  height: number;
  scale: number;
};

/** Longest-side cap for free (watermarked) stills and recordings. */
export const FREE_EXPORT_MAX = 1280;
/** Longest-side target for Pro / trial stills (4K). */
export const PRO_EXPORT_MAX = 3840;

export function exportMaxDim(entitled: boolean): number {
  return entitled ? PRO_EXPORT_MAX : FREE_EXPORT_MAX;
}

/**
 * Compute the target size for the offscreen composite/export canvas.
 *
 * Returns the engine backing resolution unchanged when its longest side is
 * within `maxDim`. When it exceeds `maxDim`, scales down uniformly so the
 * longest side equals `maxDim`, preserving aspect ratio (scale <= 1). Pure: no
 * canvas or DOM access.
 */
export function compositeTargetSize(
  engine: EngineSize,
  maxDim?: number,
): CompositeSize {
  const width = Math.max(1, Math.floor(engine.width));
  const height = Math.max(1, Math.floor(engine.height));
  const longest = Math.max(width, height);

  if (maxDim === undefined || !Number.isFinite(maxDim) || maxDim <= 0 || longest <= maxDim) {
    return { width, height, scale: 1 };
  }

  const scale = maxDim / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Export size for a still. Free plans downscale to 1280 on the long side.
 * Entitled plans upscale (or downscale) so the long side is 3840 — the 4K still.
 * Motion capture should keep using compositeTargetSize (downscale only).
 */
export function exportTargetSize(engine: EngineSize, entitled: boolean): CompositeSize {
  const maxDim = exportMaxDim(entitled);
  if (!entitled) return compositeTargetSize(engine, maxDim);
  const width = Math.max(1, Math.floor(engine.width));
  const height = Math.max(1, Math.floor(engine.height));
  const longest = Math.max(width, height);
  if (longest >= maxDim) return compositeTargetSize(engine, maxDim);
  const scale = maxDim / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}
