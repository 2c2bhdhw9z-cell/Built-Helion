/**
 * Helion service worker (Req 9 — offline/PWA).
 *
 * Served from ROOT (`/sw.js`) so its scope is `/` and it controls every
 * navigation. The `{{CACHE_NAME}}` and `{{APP_SHELL}}` tokens are baked at
 * serve/build time by `renderServiceWorker()` in helion-pwa-shared.mjs — this
 * file is a template, never served verbatim.
 *
 * Strategy:
 *   - Hashed build assets (JS/CSS/fonts/icons under /assets, /__helion, and the
 *     top-level static files): CACHE-FIRST. They are content-hashed or
 *     effectively immutable, so a cache hit is always correct and instant, and
 *     an offline reload can still boot the lab.
 *   - Navigations (HTML documents): NETWORK-FIRST with an app-shell fallback,
 *     so a fresh deploy is picked up when online but an offline reload still
 *     renders the shell (the app then runs on its PGLite offline data path).
 *   - Everything else (API routes, auth endpoints, the manifest, server-fn
 *     POSTs): NOT intercepted — those always hit the network. A new cache name
 *     per deploy plus an `activate` sweep guarantees no stale assets survive.
 *
 * DATA offline already works via PGLite; this SW is only about assets/shell.
 */
"use strict";

const CACHE_NAME = "{{CACHE_NAME}}";
const CACHE_PREFIX = "{{CACHE_PREFIX}}";
const APP_SHELL = "{{APP_SHELL}}";
// Warm the shell + its offline fallback at install so a first offline reload
// has something to render. Kept tiny; hashed assets fill the cache on demand.
const PRECACHE_URLS = ["/"];

/** Same-origin asset paths the SW may cache-first (mirrors isPrecachableAssetPath). */
function isPrecachableAssetPath(pathname) {
  const path = String(pathname || "");
  if (path.startsWith("/api/")) return false;
  if (path.startsWith("/_serverFn/")) return false;
  if (path === "/__helion/manifest.webmanifest" || path === "/__helion/manifest.json") {
    return false;
  }
  if (path.startsWith("/assets/")) return true;
  if (path.startsWith("/__helion/")) return true;
  return (
    path === "/favicon.svg" ||
    path.startsWith("/sdk/") ||
    /^\/[^/]+\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/i.test(path)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only ever touch same-origin GETs; POSTs (server functions), other origins
  // (fonts CDN), and non-GET verbs always go straight to the network.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached app shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(APP_SHELL).then((cached) => cached || caches.match("/")),
      ),
    );
    return;
  }

  if (!isPrecachableAssetPath(url.pathname)) return;

  // Cache-first for hashed/static assets: serve the cache hit instantly and
  // populate the cache on a miss. A network failure with no cache entry simply
  // rejects, exactly as it would without the SW.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
