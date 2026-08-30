/**
 * Single source of truth for the Helion head chrome (PWA + OG), shared by the
 * Vite plugin and Nitro middleware. Plain ESM so `node --test` and the Nitro
 * bundler can both consume it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_APP_NAME = "Helion";
export const OG_SITE_REL_PATH = "src/lib/og/site.json";

const SHARE_META_KEYS = new Set([
  "og:title",
  "og:description",
  "og:image",
  "og:image:width",
  "og:image:height",
  "og:type",
  "og:url",
  "og:site_name",
  "twitter:card",
  "twitter:title",
  "twitter:image",
  "twitter:description",
  "x:game:image",
  "x:game:image:width",
  "x:game:image:height",
]);

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Inverse of escapeHtml. Decode &amp; last so a single pass undoes one encode. */
function unescapeHtml(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * Standalone Helion deploys serve from a single host (built-helion.vercel.app),
 * so there is no per-host app name to derive — always the default. The argument
 * is kept so call sites reading a request Host stay unchanged.
 */
export function appNameFromHost(_hostHeader) {
  return DEFAULT_APP_NAME;
}

/**
 * True for Vercel host shapes that SSO-protect `/og.jpg` and are therefore not
 * a valid og:image origin: the apex domains and the auto-generated preview /
 * deployment URLs Envoy rewrites the origin Host to.
 *
 * A project's STABLE public host — a single clean subdomain like
 * `built-helion.vercel.app` — is NOT one of these. That host serves the real
 * app (and its /og.jpg) publicly, so it must pass. Only the generated preview
 * URLs (a deployment-hash label, or the long `-<project>-<org>` suffix Vercel
 * appends to branch/preview deploys) are SSO-gated and rejected here.
 */
function isVercelSystemHost(host) {
  if (host === "vercel.app" || host === "vercel.com") return true;
  if (host.endsWith(".vercel.com")) return true;
  if (!host.endsWith(".vercel.app")) return false;
  const label = host.slice(0, -".vercel.app".length);
  // Only the leftmost label identifies the project; a dotted label (e.g.
  // a nested system subdomain) is not a plain project host.
  if (label === "" || label.includes(".")) return true;
  return isVercelPreviewLabel(label);
}

/**
 * A Vercel preview/deployment subdomain label vs. a stable project label.
 * Preview URLs embed a generated deployment id: a long hex run and/or many
 * hyphen-separated segments ending in the `-<project>-<org>` suffix. A stable
 * project host (`built-helion`) is a short, human slug with no hash.
 */
function isVercelPreviewLabel(label) {
  // A run of 12+ hex chars is a deployment hash, never a hand-picked slug.
  if (/[0-9a-f]{12,}/.test(label)) return true;
  // Preview URLs stack several hyphen groups (`<hash>-<git>-<project>-<org>`);
  // a stable project slug stays short. Treat 4+ hyphen segments as preview.
  if (label.split("-").length >= 4) return true;
  return false;
}

/** Hostname suitable for absolute og:image URLs. Preview guests (X-Forwarded-Host) are allowed. */
export function publicAppHost(hostHeader) {
  const host = String(hostHeader ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  if (isVercelSystemHost(host)) return "";
  return host;
}

/**
 * Prefer `VITE_PUBLIC_HOSTNAME` (the public host the deploy injects) over the
 * request host — Envoy rewrites the request Host to `*.vercel.app`, which is
 * not a valid og:image origin. Live preview has no such env, so fall back to
 * the request host / X-Forwarded-Host.
 */
export function resolvePublicHost(hostHeader) {
  return (
    publicAppHost(process.env?.VITE_PUBLIC_HOSTNAME) || publicAppHost(hostHeader)
  );
}

export function isInstallQuery(url) {
  const query = String(url ?? "").split("?", 2)[1] ?? "";
  const params = new URLSearchParams(query);
  const install = params.get("install");
  const platform = (params.get("platform") ?? "").toLowerCase();
  return (install === "1" || install === "true") && platform === "ios";
}

/** Paths that can carry an app document (vs assets / API / internals). */
export function isDocumentPath(pathname) {
  const path = String(pathname ?? "");
  return (
    !path.startsWith("/__helion/") &&
    !path.startsWith("/api/") &&
    !path.startsWith("/@") &&
    !path.startsWith("/node_modules") &&
    !/\.[a-z0-9]+$/i.test(path)
  );
}

export function acceptsHtml(accept) {
  const value = String(accept ?? "");
  return value === "" || value.includes("text/html") || value.includes("*/*");
}

/** The same URL without the install-tutorial params (used as the app link). */
export function stripInstallParams(url) {
  const [path = "/", query = ""] = String(url ?? "/").split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("install");
  params.delete("platform");
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

export function renderInstallPageHtml(template, { host, url } = {}) {
  return String(template)
    .replaceAll("{{APP_NAME}}", escapeHtml(appNameFromHost(host)))
    .replaceAll("{{APP_URL}}", escapeHtml(stripInstallParams(url)));
}

export function renderWebManifest(hostHeader) {
  const name = appNameFromHost(hostHeader);
  return JSON.stringify(
    {
      name,
      short_name: name,
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        {
          src: "/__helion/icon-180.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    null,
    2,
  );
}

export function pwaHeadTags(appName = DEFAULT_APP_NAME) {
  return [
    // Standalone display comes from the manifest ("display": "standalone");
    // the legacy *-web-app-capable metas it replaces are deliberately absent.
    ["manifest", '<link rel="manifest" href="/__helion/manifest.webmanifest">'],
    ["apple-touch-icon", '<link rel="apple-touch-icon" href="/__helion/icon-180.png">'],
    [
      "apple-mobile-web-app-title",
      `<meta name="apple-mobile-web-app-title" content="${escapeHtml(appName)}">`,
    ],
    [
      "apple-mobile-web-app-status-bar-style",
      '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
    ],
    ["theme-color", '<meta name="theme-color" content="#000000">'],
  ];
}

export function readOgSite(cwd = process.cwd()) {
  try {
    const raw = readFileSync(join(cwd, OG_SITE_REL_PATH), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Public path of an on-disk share card, or "" if neither file exists. */
export function ogCardPublicPath(cwd = process.cwd()) {
  if (existsSync(join(cwd, "public/og.jpg"))) return "/og.jpg";
  if (existsSync(join(cwd, "public/og.png"))) return "/og.png";
  return "";
}

function detectCustomOgCard(cwd = process.cwd(), site = {}) {
  if (ogCardPublicPath(cwd)) return true;
  // Vercel runtime has no public/: trust a bake that already saw the file.
  return siteHasCustomCard(site) || Boolean(String(site.image ?? "").trim());
}

/** Snapshot for Vite/Nitro to bake into the server bundle (Vercel has no workspace FS). */
export function snapshotOgIdentity(cwd = process.cwd()) {
  const site = { ...readOgSite(cwd) };
  const disk = ogCardPublicPath(cwd);
  if (disk) {
    site.card = "custom";
    site.image = disk;
  } else {
    // site.json `card=custom` without a file must not bake a 404 /og.jpg URL.
    if (siteHasCustomCard(site)) delete site.card;
    if (site.image) delete site.image;
  }
  if (existsSync(join(cwd, "public/x-banner.jpg"))) {
    site.banner = site.banner || "/x-banner.jpg";
  }
  return { site };
}

export function customOgAssetPath(cwd = process.cwd()) {
  return ogCardPublicPath(cwd) || "/og.jpg";
}

export function titleFromDocument(html) {
  const match = String(html ?? "").match(/<title\b[^>]*>([^<]*)<\/title>/i);
  return match ? unescapeHtml(match[1]).trim() : "";
}

export function resolveOgTitle(
  site = {},
  appName = DEFAULT_APP_NAME,
  host = "",
  documentTitle = "",
) {
  const fromSite = String(site.title ?? "").trim();
  if (fromSite) return fromSite;
  const fromDoc = String(documentTitle ?? "").trim();
  if (fromDoc) return fromDoc;
  const fromHost = appNameFromHost(host);
  if (fromHost && fromHost !== DEFAULT_APP_NAME) return fromHost;
  const fromArg = String(appName ?? "").trim();
  return fromArg || DEFAULT_APP_NAME;
}

export function siteHasCustomCard(site = {}) {
  return String(site.card ?? "").toLowerCase() === "custom";
}

/**
 * Preview: public/og.jpg|png on disk.
 * Vercel: the bake (`card=custom` / `image`) because the function cannot stat public/.
 * Otherwise empty — no og:image is emitted.
 */
export function resolveOgCardAsset(site = {}, cwd = process.cwd()) {
  return ogCardPublicPath(cwd) || (detectCustomOgCard(cwd, site) ? String(site.image ?? "").trim() || "/og.jpg" : "");
}

/** Stamp `card=custom` when public/og.jpg or public/og.png is on disk. */
function applyCustomCardFromFs(site, cwd) {
  const disk = ogCardPublicPath(cwd);
  if (!disk) return site;
  return { ...site, card: "custom", image: disk };
}

export function ogHeadTags({
  host = "",
  appName = DEFAULT_APP_NAME,
  site = {},
  documentTitle = "",
  cwd = process.cwd(),
} = {}) {
  const title = resolveOgTitle(site, appName, host, documentTitle);
  const publicHost = resolvePublicHost(host);
  const tags = [
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
  ];
  const description = String(site.description ?? "").trim();
  if (description) {
    tags.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  }
  if (String(site.type ?? "").toLowerCase() === "x:game") {
    tags.push(`<meta property="og:type" content="x:game">`);
  }
  if (publicHost) {
    // Only emit og:image when a real custom card asset exists. Without one we
    // emit no og:image rather than pointing at an external placeholder.
    const asset = resolveOgCardAsset(site, cwd);
    if (asset) {
      const image = `https://${publicHost}${asset.startsWith("/") ? asset : `/${asset}`}`;
      tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
      tags.push(`<meta property="og:image:width" content="1200">`);
      tags.push(`<meta property="og:image:height" content="630">`);
      // `twitter:card=summary_large_image` renders a blank card without its own
      // image tag; point it at the same absolute asset as og:image.
      tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);
      const banner = String(site.banner ?? "").trim();
      if (banner) {
        const bannerUrl = `https://${publicHost}${banner.startsWith("/") ? banner : `/${banner}`}`;
        tags.push(`<meta property="x:game:image" content="${escapeHtml(bannerUrl)}">`);
        tags.push(`<meta property="x:game:image:width" content="1200">`);
        tags.push(`<meta property="x:game:image:height" content="264">`);
      }
    }
  }
  return tags;
}

export function stripShareMetaTags(html) {
  return String(html).replace(/<meta\b[^>]*>/gi, (tag) => {
    const attrs = [...tag.matchAll(/\b(?:property|name)\s*=\s*["']([^"']+)["']/gi)];
    for (const match of attrs) {
      if (SHARE_META_KEYS.has(String(match[1]).toLowerCase())) return "";
    }
    return tag;
  });
}

function insertAfterHeadOpen(html, snippet) {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (open) => `${open}${snippet}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${snippet}</head>`);
  }
  return `<!doctype html><html><head>${snippet}</head>${html}`;
}

function insertBeforeHeadClose(html, snippet) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippet}</head>`);
  return insertAfterHeadOpen(html, snippet);
}

export function normalizeHeadContext(ctx = {}) {
  const cwd = ctx.cwd ?? process.cwd();
  // Middleware passes a baked `site`. Still consult the workspace so a
  // public/og.jpg generated after that snapshot (or missed by a wrong cwd)
  // is picked up. Vercel has no public/ to read, so a correct bake is
  // unchanged.
  const site = applyCustomCardFromFs(
    ctx.site !== undefined ? ctx.site : snapshotOgIdentity(cwd).site,
    cwd,
  );
  const appName = resolveOgTitle(site, ctx.appName ?? DEFAULT_APP_NAME, ctx.host ?? "");
  return {
    appName,
    host: ctx.host ?? "",
    cwd,
    site,
  };
}

export function injectHelionPwaHead(html, ctx = {}) {
  if (typeof html !== "string") return html;
  const { site, host, cwd } = normalizeHeadContext(ctx);
  const documentTitle = titleFromDocument(html);
  const appName = resolveOgTitle(
    site,
    ctx.appName ?? DEFAULT_APP_NAME,
    host,
    documentTitle,
  );
  let next = stripShareMetaTags(html);

  const missing = pwaHeadTags(appName)
    .filter(([key]) => {
      if (key === "manifest") return !next.includes('href="/__helion/manifest.webmanifest"');
      if (key === "apple-touch-icon") return !next.includes('href="/__helion/icon-180.png"');
      return !next.includes(`name="${key}"`);
    })
    .map(([, tag]) => tag);

  next = insertAfterHeadOpen(
    next,
    ogHeadTags({ host, appName, site, documentTitle, cwd }).join(""),
  );

  if (missing.length === 0) return next;
  return insertBeforeHeadClose(next, missing.join(""));
}

function findHeadClose(buf) {
  const at = buf.toString("latin1").search(/<\/head>/i);
  return at;
}

/**
 * Streaming head injector: buffers only until `</head>` (ASCII marker; never
 * appears inside a UTF-8 continuation byte), overwrites share-card metas,
 * then passes later chunks through so streaming SSR keeps streaming.
 */
export function createHeadInjector(ctx = {}) {
  const normalized = normalizeHeadContext(ctx);

  /** @type {Buffer[]} */
  let pending = [];
  let done = false;

  const apply = (html) =>
    injectHelionPwaHead(html, {
      appName: normalized.appName,
      host: normalized.host,
      cwd: normalized.cwd,
      site: normalized.site,
    });

  return {
    /** @param {Uint8Array | string} chunk @returns {Buffer[]} chunks ready to emit */
    push(chunk) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (done) return [buf];
      pending.push(buf);
      const joined = Buffer.concat(pending);
      const at = findHeadClose(joined);
      if (at === -1) return [];
      done = true;
      pending = [];
      const closeLen = joined.toString("latin1", at).match(/^<\/head>/i)[0].length;
      const head = apply(joined.subarray(0, at + closeLen).toString("utf8"));
      return [Buffer.concat([Buffer.from(head, "utf8"), joined.subarray(at + closeLen)])];
    },
    /** @returns {Buffer[]} whatever is still buffered (no `</head>` seen) */
    flush() {
      if (done || pending.length === 0) return [];
      const rest = Buffer.concat(pending);
      pending = [];
      done = true;
      return [Buffer.from(apply(rest.toString("utf8")), "utf8")];
    },
  };
}
