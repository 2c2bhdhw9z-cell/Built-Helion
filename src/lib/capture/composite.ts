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
