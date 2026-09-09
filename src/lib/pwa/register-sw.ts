/**
 * Client-side service-worker registration (Req 9 — offline/PWA).
 *
 * The SW is served at ROOT (`/sw.js`) so its scope is `/` and it can control
 * every navigation, letting an offline reload still boot the lab shell (data
 * already works offline via PGLite). Registration is guarded so it NEVER runs
 * in dev — a live SW would cache Vite's dev/HMR modules and break hot reload —
 * and only where the browser supports service workers.
 *
 * This module is client-only and does no work at import time; the caller invokes
 * `registerServiceWorker()` from an effect after mount.
 */

/** True only in a browser that supports service workers, in a production build. */
export function shouldRegisterServiceWorker(): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  // import.meta.env.PROD is true only in a built bundle, never under `vite dev`.
  return Boolean(import.meta.env?.PROD);
}

/**
 * Register the root-scoped service worker when supported and in production.
 * Idempotent and failure-tolerant: a registration error is logged and swallowed
 * so it can never block app boot.
 */
export function registerServiceWorker(): void {
  if (!shouldRegisterServiceWorker()) return;
  // Register after load so the SW install never competes with first paint.
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("[helion:pwa] service worker registration failed:", err);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
