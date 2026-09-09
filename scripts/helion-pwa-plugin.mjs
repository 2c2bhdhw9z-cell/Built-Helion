/**
 * Dev/preview (Vite) half of the Helion PWA chrome: serves the ?install=1
 * tutorial and the per-app manifest, and injects missing PWA head tags into
 * app documents. The deployed-app half lives in server/middleware/helion-pwa.ts;
 * both share scripts/helion-pwa-shared.mjs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  acceptsHtml,
  createHeadInjector,
  injectHelionPwaHead,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderServiceWorker,
  renderWebManifest,
  snapshotOgIdentity,
  SW_PATH,
} from "./helion-pwa-shared.mjs";

export const OG_IDENTITY_ID = "virtual:helion-og-identity";
export const SW_MODULE_ID = "virtual:helion-sw";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALL_PAGE_PATH = join(HERE, "install-page.html");
const SERVICE_WORKER_PATH = join(HERE, "service-worker.js");

/**
 * A cache-busting version for the service worker. In dev/preview we hash the
 * built asset filenames (`dist/assets` after a build) so a rebuild rotates the
 * cache; before any build there is nothing to serve offline, so a stable "dev"
 * sentinel is fine (dev registers the SW only in production builds anyway).
 */
function resolveSwVersion(root) {
  for (const rel of [".vercel/output/static/assets", "dist/assets"]) {
    try {
      const names = readdirSync(join(root, rel)).sort();
      if (names.length > 0) {
        return createHash("sha1").update(names.join("\n")).digest("hex").slice(0, 12);
      }
    } catch {
      /* not built yet — fall through */
    }
  }
  return "dev";
}

function serviceWorkerSource(root) {
  const template = readFileSync(SERVICE_WORKER_PATH, "utf8");
  return renderServiceWorker(template, { version: resolveSwVersion(root) });
}

/**
 * The SW source baked into the SERVER bundle for the deployed (Nitro) half,
 * which cannot read `dist/assets` at request time. Its cache version is a hash
 * of the SW template plus this build's timestamp, so every `vite build` yields
 * fresh SW bytes → the browser reinstalls and the `activate` sweep drops the
 * previous deploy's asset cache (no stale assets survive a deploy).
 */
function bakedServiceWorkerSource() {
  const template = readFileSync(SERVICE_WORKER_PATH, "utf8");
  const version = createHash("sha1")
    .update(template)
    .update(String(Date.now()))
    .digest("hex")
    .slice(0, 12);
  return renderServiceWorker(template, { version });
}

function requestHost(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const host = forwarded ?? req.headers.host ?? req.headers[":authority"];
  return Array.isArray(host) ? host[0] : host;
}

export function renderInstallPage(hostHeader, url = "/") {
  const template = readFileSync(INSTALL_PAGE_PATH, "utf8");
  return renderInstallPageHtml(template, { host: hostHeader, url });
}

function sendHtml(res, html) {
  const body = Buffer.from(html, "utf8");
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("content-length", String(body.byteLength));
  res.end(body);
}

function serveHelionPwa(middlewares, cwd) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url ?? "";
    const pathOnly = rawUrl.split("?", 1)[0] ?? "";
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      next();
      return;
    }

    if (pathOnly === SW_PATH) {
      const body = Buffer.from(serviceWorkerSource(cwd), "utf8");
      res.statusCode = 200;
      // Root-scoped by virtue of the path; `Service-Worker-Allowed: /` is set
      // for defense-in-depth. `no-cache` so a new deploy's SW is re-fetched
      // (the SW then rotates the asset cache via its versioned cache name).
      res.setHeader("content-type", "text/javascript; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("service-worker-allowed", "/");
      res.setHeader("content-length", String(body.byteLength));
      res.end(body);
      return;
    }

    if (pathOnly === "/__helion/manifest.webmanifest" || pathOnly === "/__helion/manifest.json") {
      const body = Buffer.from(renderWebManifest(requestHost(req)), "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/manifest+json; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("content-length", String(body.byteLength));
      res.end(body);
      return;
    }

    if (isInstallQuery(rawUrl) && isDocumentPath(pathOnly) && acceptsHtml(req.headers.accept)) {
      try {
        sendHtml(res, renderInstallPage(requestHost(req), rawUrl));
      } catch (err) {
        console.error("[helion:pwa] install page missing:", err);
        res.statusCode = 500;
        res.end("install page unavailable");
      }
      return;
    }

    next();
  });
}

/**
 * Wrap res.write/res.end on app-document requests to inject missing PWA head
 * tags at the `</head>` boundary as chunks stream through (no full-document
 * buffering, so streaming SSR keeps its early flush). Skips anything already
 * content-encoded: under `vite preview` the compression middleware can hand
 * this wrapper gzipped bytes, which must pass through untouched.
 */
function wrapHtmlResponses(middlewares, cwd) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url ?? "";
    const pathOnly = rawUrl.split("?", 1)[0] ?? "";
    const method = (req.method ?? "GET").toUpperCase();
    const looksLikeDocument =
      method === "GET" &&
      String(req.headers.accept ?? "").includes("text/html") &&
      !isInstallQuery(rawUrl) &&
      isDocumentPath(pathOnly);
    if (!looksLikeDocument) {
      next();
      return;
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const host = requestHost(req);
    const injector = createHeadInjector({
      host,
      cwd,
    });
    let mode = null; // null = undecided, "inject" | "passthrough"

    const decideMode = () => {
      if (mode) return mode;
      const isHtml = String(res.getHeader("content-type") ?? "").includes("text/html");
      const encoded = Boolean(res.getHeader("content-encoding"));
      mode = isHtml && !encoded ? "inject" : "passthrough";
      // Streaming SSR flushes headers before the first body chunk, so the
      // header may no longer be removable — chunked responses don't carry one.
      if (mode === "inject" && !res.headersSent) res.removeHeader("content-length");
      return mode;
    };

    const toBuffer = (chunk, encoding) => {
      if (Buffer.isBuffer(chunk)) return chunk;
      if (typeof chunk === "string") {
        return Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
      }
      return Buffer.from(chunk);
    };

    res.write = (chunk, encoding, cb) => {
      if (decideMode() === "passthrough") return originalWrite(chunk, encoding, cb);
      const done = typeof encoding === "function" ? encoding : cb;
      if (chunk) {
        for (const out of injector.push(toBuffer(chunk, encoding))) originalWrite(out);
      }
      if (typeof done === "function") done();
      return true;
    };

    res.end = (chunk, encoding, cb) => {
      const done = typeof encoding === "function" ? encoding : cb;
      if (decideMode() === "passthrough") return originalEnd(chunk, encoding, cb);
      if (chunk) {
        for (const out of injector.push(toBuffer(chunk, encoding))) originalWrite(out);
      }
      for (const out of injector.flush()) originalWrite(out);
      return originalEnd(undefined, undefined, done);
    };

    next();
  });
}

export function helionPwaPlugin() {
  let root = process.cwd();
  return {
    name: "helion:pwa",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === OG_IDENTITY_ID) return `\0${OG_IDENTITY_ID}`;
      if (id === SW_MODULE_ID) return `\0${SW_MODULE_ID}`;
    },
    load(id) {
      if (id === `\0${OG_IDENTITY_ID}`) {
        return `export const ogIdentity = ${JSON.stringify(snapshotOgIdentity(root))};`;
      }
      if (id === `\0${SW_MODULE_ID}`) {
        // Bake the rendered SW source (with a per-build cache version) so the
        // deployed Nitro middleware can serve it without a workspace FS.
        return `export const serviceWorkerSource = ${JSON.stringify(bakedServiceWorkerSource())};`;
      }
    },
    transformIndexHtml(html) {
      return injectHelionPwaHead(html, {
        host: process.env.VITE_PUBLIC_HOSTNAME ?? "",
        cwd: root,
      });
    },
    configureServer(server) {
      // Registered directly (not in a returned post-hook) so both run BEFORE
      // TanStack Start's SSR middleware, like the auth-popup plugin.
      serveHelionPwa(server.middlewares, root);
      wrapHtmlResponses(server.middlewares, root);
    },
    configurePreviewServer(server) {
      serveHelionPwa(server.middlewares, root);
      // Post-hook: preview registers compression between the direct hooks and
      // the post-hooks, and the injector must wrap AFTER compression so it
      // sees plaintext HTML (compression then compresses the injected output).
      return () => {
        wrapHtmlResponses(server.middlewares, root);
      };
    },
  };
}
