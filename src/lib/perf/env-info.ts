/**
 * Environment / capability readers for the perf hub. Every reader is guarded so
 * it is safe under SSR (no window/navigator/document) and safe to unit test
 * under happy-dom / node. Nothing here fabricates values: when a metric is not
 * available it is reported as `{ available: false }` rather than invented.
 */

export type PerformanceMemoryInfo = {
  available: boolean;
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
};

/** Shape of the non-standard, Chromium-only `performance.memory` object. */
type MemoryLike = {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
};

/**
 * Feature-detect `performance.memory` (Chromium only; absent on Safari/iOS and
 * Firefox). Returns `{ available: false }` cleanly when the object is missing.
 *
 * @param perf optional performance-like object to read from (used for testing);
 *             defaults to the global `performance` when present.
 */
export function readPerformanceMemory(
  perf?: { memory?: MemoryLike } | undefined,
): PerformanceMemoryInfo {
  const source =
    perf ??
    (typeof performance !== "undefined"
      ? (performance as unknown as { memory?: MemoryLike })
      : undefined);
  const mem = source?.memory;
  if (!mem || typeof mem !== "object") return { available: false };
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = mem;
  if (
    typeof usedJSHeapSize !== "number" &&
    typeof totalJSHeapSize !== "number" &&
    typeof jsHeapSizeLimit !== "number"
  ) {
    return { available: false };
  }
  return {
    available: true,
    usedJSHeapSize,
    totalJSHeapSize,
    jsHeapSizeLimit,
  };
}

export type GpuInfo = {
  available: boolean;
  vendor?: string;
  renderer?: string;
};

// WEBGL_debug_renderer_info enum values (spec constants, avoids needing the ext
// object present at type-check time).
const UNMASKED_VENDOR_WEBGL = 0x9245;
const UNMASKED_RENDERER_WEBGL = 0x9246;

/**
 * Read the unmasked GPU vendor/renderer via the WEBGL_debug_renderer_info
 * extension. The extension may be masked or unsupported (common on privacy-
 * hardened browsers), in which case `{ available: false }` is returned. Never
 * throws; any failure degrades gracefully.
 */
export function readGpuInfo(gl: WebGL2RenderingContext | null): GpuInfo {
  if (!gl) return { available: false };
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return { available: false };
    const vendorRaw = gl.getParameter(UNMASKED_VENDOR_WEBGL);
    const rendererRaw = gl.getParameter(UNMASKED_RENDERER_WEBGL);
    const vendor = typeof vendorRaw === "string" ? vendorRaw : undefined;
    const renderer = typeof rendererRaw === "string" ? rendererRaw : undefined;
    if (!vendor && !renderer) return { available: false };
    return { available: true, vendor, renderer };
  } catch {
    return { available: false };
  }
}

export type DeviceInfo = {
  available: boolean;
  userAgent?: string;
  platform?: string;
  devicePixelRatio?: number;
  hardwareConcurrency?: number;
  language?: string;
};

/**
 * Best-effort device info from navigator/window. SSR-guarded: returns
 * `{ available: false }` when navigator/window are undefined. Only reads values
 * that exist; never fabricates.
 */
export function readDeviceInfo(): DeviceInfo {
  if (typeof navigator === "undefined" && typeof window === "undefined") {
    return { available: false };
  }
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const dpr =
    typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
      ? window.devicePixelRatio
      : undefined;
  const info: DeviceInfo = {
    available: true,
    userAgent: nav?.userAgent,
    platform:
      nav && typeof (nav as { platform?: string }).platform === "string"
        ? (nav as { platform?: string }).platform
        : undefined,
    devicePixelRatio: dpr,
    hardwareConcurrency:
      nav && typeof nav.hardwareConcurrency === "number"
        ? nav.hardwareConcurrency
        : undefined,
    language: nav?.language,
  };
  return info;
}
