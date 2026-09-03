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

export type ExportSize = "1080" | "4k" | "8k";
export type RecordFps = 24 | 30 | 60;

/** Longest-side cap for free (watermarked) stills and recordings. */
export const FREE_EXPORT_MAX = 1280;
/** Longest-side target for HD stills. */
export const HD_EXPORT_MAX = 1920;
/** Longest-side target for Pro / trial stills (4K). */
export const PRO_EXPORT_MAX = 3840;
/** Longest-side target for Enterprise stills (8K). */
export const ENTERPRISE_EXPORT_MAX = 7680;

export function sizeToMaxDim(size: ExportSize): number {
  if (size === "8k") return ENTERPRISE_EXPORT_MAX;
  if (size === "4k") return PRO_EXPORT_MAX;
  return HD_EXPORT_MAX;
}

export function clampExportSize(
  size: ExportSize,
  entitled: boolean,
  plan: "free" | "pro" | "enterprise",
): ExportSize {
  if (!entitled) return "1080";
  if (size === "8k" && plan !== "enterprise") return "4k";
  return size;
}

export function exportMaxDim(
  entitled: boolean,
  size: ExportSize = "4k",
  plan: "free" | "pro" | "enterprise" = entitled ? "pro" : "free",
): number {
  if (!entitled) return FREE_EXPORT_MAX;
  return sizeToMaxDim(clampExportSize(size, entitled, plan));
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
 * Entitled plans upscale (or downscale) so the long side matches the chosen
 * 1080 / 4K / 8K target.
 */
export function exportTargetSize(
  engine: EngineSize,
  entitled: boolean,
  size: ExportSize = "4k",
  plan: "free" | "pro" | "enterprise" = entitled ? "pro" : "free",
): CompositeSize {
  const maxDim = exportMaxDim(entitled, size, plan);
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
