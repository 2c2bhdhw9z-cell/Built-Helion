/**
 * Where this build is running. Detected from real globals, never faked.
 * "capacitor" / "tauri" only appear when those shells inject their bridges.
 * This web build does not ship store binaries.
 */
export type RuntimeKind = "web" | "pwa" | "capacitor" | "tauri";

type NativeGlobals = {
  Capacitor?: { isNativePlatform?: () => boolean };
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
  window?: NativeGlobals;
};

export function runtimeKind(): RuntimeKind {
  const g = globalThis as unknown as NativeGlobals;
  const w: NativeGlobals = g.window ?? g;
  try {
    if (typeof w.Capacitor?.isNativePlatform === "function" && w.Capacitor.isNativePlatform()) {
      return "capacitor";
    }
    if (w.__TAURI_INTERNALS__ || w.__TAURI__) return "tauri";
  } catch {
    /* ignore */
  }
  try {
    if (w.matchMedia?.("(display-mode: standalone)").matches) return "pwa";
    if (w.navigator?.standalone) return "pwa";
  } catch {
    /* ignore */
  }
  return "web";
}
