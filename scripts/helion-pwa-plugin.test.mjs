import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  appNameFromHost,
  createHeadInjector,
  injectHelionPwaHead,
  isDocumentPath,
  isInstallQuery,
  publicAppHost,
  renderWebManifest,
  resolveOgCardAsset,
  snapshotOgIdentity,
  stripInstallParams,
} from "./helion-pwa-shared.mjs";
import { renderInstallPage } from "./helion-pwa-plugin.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("injects before </head>", () => {
  const out = injectHelionPwaHead("<html><head><title>x</title></head><body></body></html>");
  assert.match(out, /rel="manifest"/);
  assert.match(out, /apple-touch-icon/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
});

test("never injects a grok.com phone-home script or grok metas", () => {
  const out = injectHelionPwaHead("<html><head></head></html>", { appName: "Demo" });
  assert.doesNotMatch(out, /grok\.com/);
  assert.doesNotMatch(out, /extensions\.js/);
  assert.doesNotMatch(out, /grok-project-id/);
  assert.doesNotMatch(out, /data-project-id/);
  assert.doesNotMatch(out, /property="grok:app_id"/);
  assert.doesNotMatch(out, /property="x:creator"/);
});

test("platform chrome overwrites share-card metas and always sets og:title", () => {
  const html =
    '<html><head><title>Hello World</title><meta property="og:title" content="Old"><meta name="twitter:card" content="summary"></head></html>';
  const out = injectHelionPwaHead(html, {
    appName: "Wild Race",
    site: {},
    cwd: mkdtempSync(join(tmpdir(), "helion-og-doc-")),
  });
  assert.match(out, /name="twitter:card" content="summary_large_image"/);
  assert.match(out, /property="og:title" content="Hello World"/);
  assert.doesNotMatch(out, /content="Old"/);
  assert.doesNotMatch(out, /content="summary"/);
  assert.equal(out.split('name="twitter:card"').length - 1, 1);
  assert.equal(out.split('property="og:title"').length - 1, 1);
  assert.doesNotMatch(out, /property="og:image"/);
});

test("does not duplicate twitter:card or og:title", () => {
  const once = injectHelionPwaHead("<html><head><title>Hello World</title></head></html>");
  const twice = injectHelionPwaHead(once);
  assert.equal(once, twice);
  assert.equal(twice.split('name="twitter:card"').length - 1, 1);
  assert.equal(twice.split('property="og:title"').length - 1, 1);
});

test("a baked site.image is treated as a custom card", () => {
  const out = injectHelionPwaHead("<html><head></head></html>", {
    host: "built-helion.example.com",
    cwd: mkdtempSync(join(tmpdir(), "helion-og-image-only-")),
    site: { title: "Helion", image: "/og.jpg" },
  });
  assert.match(out, /property="og:image" content="https:\/\/built-helion\.example\.com\/og\.jpg"/);
  assert.doesNotMatch(out, /grok/);
});

test("baked identity does not need a workspace filesystem", () => {
  const empty = mkdtempSync(join(tmpdir(), "helion-og-empty-"));
  const out = injectHelionPwaHead("<html><head></head></html>", {
    host: "built-helion.example.com",
    cwd: empty,
    site: { title: "Helion", type: "x:game", card: "custom" },
  });
  assert.match(out, /property="og:title" content="Helion"/);
  assert.match(out, /property="og:type" content="x:game"/);
  assert.match(out, /property="og:image" content="https:\/\/built-helion\.example\.com\/og\.jpg"/);
  assert.doesNotMatch(out, /grok/);
});

test("a public card file wins over a baked site without card=custom", () => {
  // Deploy middleware always passes a baked `site`. If that snapshot missed
  // the file, public/og.jpg must still be picked up.
  const root = mkdtempSync(join(tmpdir(), "helion-og-card-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.jpg"), "x");
  const out = injectHelionPwaHead("<html><head></head></html>", {
    host: "built-helion.example.com",
    cwd: root,
    site: {},
  });
  assert.match(out, /property="og:image" content="https:\/\/built-helion\.example\.com\/og\.jpg"/);
});

test("public/og.png wins when jpg is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "helion-og-png-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.png"), "x");
  const out = injectHelionPwaHead("<html><head></head></html>", {
    host: "built-helion.example.com",
    cwd: root,
    site: { title: "Helion" },
  });
  assert.match(out, /property="og:image" content="https:\/\/built-helion\.example\.com\/og\.png"/);
});

test("resolveOgCardAsset: disk file, then bake, then empty", () => {
  const empty = mkdtempSync(join(tmpdir(), "helion-og-none-"));
  assert.equal(resolveOgCardAsset({}, empty), "");
  assert.equal(resolveOgCardAsset({ title: "X" }, empty), "");

  const baked = resolveOgCardAsset({ card: "custom", image: "/og.jpg" }, empty);
  assert.equal(baked, "/og.jpg");

  const root = mkdtempSync(join(tmpdir(), "helion-og-disk-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.jpg"), "x");
  assert.equal(resolveOgCardAsset({}, root), "/og.jpg");
  assert.equal(resolveOgCardAsset({ card: "custom", image: "/other.png" }, root), "/og.jpg");
});

test("snapshotOgIdentity stamps card=custom from a public card file", () => {
  const root = mkdtempSync(join(tmpdir(), "helion-og-snap-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.jpg"), "x");
  const { site } = snapshotOgIdentity(root);
  assert.equal(site.card, "custom");
  assert.equal(site.image, "/og.jpg");
  assert.equal(site.banner, undefined);
});

test("snapshotOgIdentity drops card=custom when no card file exists", () => {
  const empty = mkdtempSync(join(tmpdir(), "helion-og-nocard-"));
  const { site } = snapshotOgIdentity(empty);
  assert.equal(site.card, undefined);
  assert.equal(site.image, undefined);
});

test("snapshotOgIdentity stamps banner from public/x-banner.jpg", () => {
  const root = mkdtempSync(join(tmpdir(), "helion-og-banner-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/x-banner.jpg"), "x");
  const { site } = snapshotOgIdentity(root);
  assert.equal(site.banner, "/x-banner.jpg");
});

test("emits x:game:image for a public host when site.banner is set", () => {
  const html = "<html><head><meta property=\"x:game:image\" content=\"old\"></head></html>";
  const out = injectHelionPwaHead(html, {
    host: "built-helion.example.com",
    site: { title: "Helion", type: "x:game", card: "custom", banner: "/x-banner.jpg" },
  });
  assert.match(
    out,
    /property="x:game:image" content="https:\/\/built-helion\.example\.com\/x-banner\.jpg"/,
  );
  assert.match(out, /property="x:game:image:width" content="1200"/);
  assert.match(out, /property="x:game:image:height" content="264"/);
  assert.doesNotMatch(out, /content="old"/);
  assert.equal(out.split('property="x:game:image"').length - 1, 1);
});

test("does not emit x:game:image without a public host or banner", () => {
  const noHost = injectHelionPwaHead("<html><head></head></html>", {
    site: { banner: "/x-banner.jpg" },
  });
  assert.doesNotMatch(noHost, /x:game:image/);
  const noBanner = injectHelionPwaHead("<html><head></head></html>", {
    host: "built-helion.example.com",
    site: { type: "x:game", card: "custom" },
  });
  assert.doesNotMatch(noBanner, /x:game:image/);
});

test("site title is a real name, not a sentinel", () => {
  const out = injectHelionPwaHead("<html><head></head></html>", {
    host: "built-helion.example.com",
    site: { title: "Helion" },
  });
  assert.match(out, /property="og:title" content="Helion"/);
});

test("rejects Vercel system hosts as og:image origins", () => {
  assert.equal(publicAppHost("01a020b6-803a-71a2-bb47-e2bec57eb9a2-662k8x1l1-xai-org.vercel.app"), "");
  assert.equal(publicAppHost("demo.vercel.app:443"), "");
  assert.equal(publicAppHost("vercel.app"), "");
  assert.equal(publicAppHost("built-helion.example.com"), "built-helion.example.com");
});

test("published VITE_PUBLIC_HOSTNAME wins over request Host for og:image", () => {
  const prev = process.env.VITE_PUBLIC_HOSTNAME;
  // vercel.app is a system host and rejected as an og:image origin, so use a
  // non-vercel public host to exercise the VITE_PUBLIC_HOSTNAME preference.
  process.env.VITE_PUBLIC_HOSTNAME = "helion.example.com";
  try {
    const vercelHost = injectHelionPwaHead("<html><head><title>Helion</title></head></html>", {
      host: "01a020b6-803a-71a2-bb47-e2bec57eb9a2-662k8x1l1-xai-org.vercel.app",
      site: { title: "Helion", card: "custom" },
    });
    assert.match(
      vercelHost,
      /property="og:image" content="https:\/\/helion\.example\.com\/og\.jpg"/,
    );
    assert.doesNotMatch(vercelHost, /vercel\.app/);

    const otherPublicHost = injectHelionPwaHead("<html><head><title>Helion</title></head></html>", {
      host: "custom.example.com",
      site: { title: "Helion", card: "custom" },
    });
    assert.match(
      otherPublicHost,
      /property="og:image" content="https:\/\/helion\.example\.com\/og\.jpg"/,
    );
    assert.doesNotMatch(otherPublicHost, /custom\.example\.com/);
  } finally {
    if (prev === undefined) delete process.env.VITE_PUBLIC_HOSTNAME;
    else process.env.VITE_PUBLIC_HOSTNAME = prev;
  }
});

test("vercel Host without a public hostname emits no og:image", () => {
  const prev = process.env.VITE_PUBLIC_HOSTNAME;
  delete process.env.VITE_PUBLIC_HOSTNAME;
  try {
    const out = injectHelionPwaHead("<html><head><title>Helion</title></head></html>", {
      host: "01a020b6-803a-71a2-bb47-e2bec57eb9a2-662k8x1l1-xai-org.vercel.app",
      site: { title: "Helion", card: "custom" },
    });
    assert.doesNotMatch(out, /property="og:image"/);
    assert.doesNotMatch(out, /vercel\.app/);
  } finally {
    if (prev === undefined) delete process.env.VITE_PUBLIC_HOSTNAME;
    else process.env.VITE_PUBLIC_HOSTNAME = prev;
  }
});

test("emits a custom-card og:image for a public host", () => {
  const custom = injectHelionPwaHead("<html><head></head></html>", {
    appName: "Helion",
    host: "built-helion.example.com",
    site: { title: "Helion", card: "custom", type: "x:game" },
  });
  assert.match(custom, /property="og:image" content="https:\/\/built-helion\.example\.com\/og\.jpg"/);
  assert.match(custom, /property="og:image:width" content="1200"/);
  assert.match(custom, /property="og:type" content="x:game"/);
});

test("emits no og:image for a public host without a custom card", () => {
  const empty = mkdtempSync(join(tmpdir(), "helion-og-noimage-"));
  const out = injectHelionPwaHead("<html><head></head></html>", {
    appName: "Helion",
    host: "built-helion.example.com",
    cwd: empty,
    site: { title: "Helion" },
  });
  assert.doesNotMatch(out, /property="og:image"/);
  assert.doesNotMatch(out, /grok/);
});

test("document title entities are not double-escaped on og:title", () => {
  const out = injectHelionPwaHead(
    "<html><head><title>Cats &amp; Dogs</title></head></html>",
    { site: {}, cwd: mkdtempSync(join(tmpdir(), "helion-og-ent-")) },
  );
  assert.match(out, /property="og:title" content="Cats &amp; Dogs"/);
  assert.doesNotMatch(out, /Cats &amp;amp; Dogs/);
});

test("site.json title wins over the host slug", () => {
  const out = injectHelionPwaHead("<html><head></head></html>", {
    host: "built-helion.example.com",
    site: { title: "Pixel Nova" },
  });
  assert.match(out, /property="og:title" content="Pixel Nova"/);
});

test("injects into documents with no head element", () => {
  const out = injectHelionPwaHead("<html><body>hi</body></html>", {
    appName: "Solo",
    site: {},
    cwd: mkdtempSync(join(tmpdir(), "helion-og-nohead-")),
  });
  assert.match(out, /<head>/);
  assert.match(out, /property="og:title" content="Solo"/);
  assert.match(out, /<\/head>/);
});

test("streaming injector matches </HEAD> case-insensitively", () => {
  const injector = createHeadInjector({
    appName: "Wild Race",
    site: {},
    cwd: mkdtempSync(join(tmpdir(), "helion-og-stream-")),
  });
  const chunks = [
    ...injector.push("<html><HEAD><title>x</title></HE"),
    ...injector.push("AD><body>hello</body></html>"),
  ];
  const out = Buffer.concat(chunks).toString("utf8");
  assert.match(out, /property="og:title" content="x"/);
  assert.match(out, /<body>hello<\/body>/);
});

test("is idempotent", () => {
  const once = injectHelionPwaHead("<html><head></head></html>");
  const twice = injectHelionPwaHead(once);
  assert.equal(once, twice);
});

test("uses the app name in the injected title tag", () => {
  const out = injectHelionPwaHead("<html><head></head></html>", {
    appName: "Wild Race",
    site: {},
    cwd: mkdtempSync(join(tmpdir(), "helion-og-title-")),
  });
  assert.match(out, /apple-mobile-web-app-title" content="Wild Race"/);
});

test("streaming injector handles </head> split across chunks", () => {
  const injector = createHeadInjector({ appName: "Wild Race" });
  const chunks = [
    ...injector.push("<html><head><title>x</title></he"),
    ...injector.push("ad><body>hello</body></html>"),
  ];
  const out = Buffer.concat(chunks).toString("utf8");
  assert.match(out, /rel="manifest"/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
  assert.match(out, /<body>hello<\/body>/);
  assert.deepEqual(injector.flush(), []);
});

test("streaming injector passes post-head chunks through untouched", () => {
  const injector = createHeadInjector();
  injector.push("<html><head></head>");
  const [tail] = injector.push("<body>tail</body>");
  assert.equal(tail.toString("utf8"), "<body>tail</body>");
});

test("streaming injector falls back when no </head> is seen", () => {
  const injector = createHeadInjector();
  assert.deepEqual(injector.push("<html><head>"), []);
  const out = Buffer.concat(injector.flush()).toString("utf8");
  assert.match(out, /rel="manifest"/);
});

test("detects install query", () => {
  assert.equal(isInstallQuery("/?install=1&platform=ios"), true);
  assert.equal(isInstallQuery("/app?foo=1&install=true&platform=ios"), true);
  assert.equal(isInstallQuery("/?install=1"), false);
  assert.equal(isInstallQuery("/?install=1&platform=android"), false);
  assert.equal(isInstallQuery("/?install=0&platform=ios"), false);
  assert.equal(isInstallQuery("/"), false);
});

test("filters non-document paths", () => {
  assert.equal(isDocumentPath("/"), true);
  assert.equal(isDocumentPath("/app"), true);
  assert.equal(isDocumentPath("/api/thing"), false);
  assert.equal(isDocumentPath("/__helion/install/styles.css"), false);
  assert.equal(isDocumentPath("/logo.png"), false);
});

test("strips install params from the app link", () => {
  assert.equal(stripInstallParams("/?install=1&platform=ios"), "/");
  assert.equal(stripInstallParams("/app?install=1&platform=ios&tab=2"), "/app?tab=2");
});

test("names the install page with the Helion default", () => {
  assert.equal(appNameFromHost("localhost:8080"), "Helion");
  assert.equal(appNameFromHost("172.17.154.217:8080"), "Helion");
  assert.equal(appNameFromHost("built-helion.vercel.app"), "Helion");
});

test("renders install page markup", () => {
  const html = renderInstallPage("built-helion.vercel.app", "/?install=1&platform=ios");
  assert.match(html, /Add Helion to your/);
  assert.match(html, /\/__helion\/install\/styles\.css/);
  assert.match(html, /href="\/"/);
  assert.equal(html.includes("{{APP_NAME}}"), false);
  assert.equal(html.includes("{{APP_URL}}"), false);
});

test("renders the manifest with the app name", () => {
  const manifest = JSON.parse(renderWebManifest("built-helion.vercel.app"));
  assert.equal(manifest.name, "Helion");
  assert.equal(manifest.short_name, "Helion");
  assert.equal(manifest.icons[0].src, "/__helion/icon-180.png");
});

// Tripwires: the deployed-app path only works if Nitro scans server/ — an
// accidental edit that drops serverDir or the middleware file would otherwise
// fail silently (published apps would just render the app for ?install=1).
test("vite config keeps the nitro serverDir wiring", () => {
  const viteConfig = readFileSync(join(TEMPLATE_ROOT, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /helionPwaPlugin\(\)/);
});

test("nitro middleware and its bundled assets exist", () => {
  const middleware = readFileSync(
    join(TEMPLATE_ROOT, "server/middleware/helion-pwa.ts"),
    "utf8",
  );
  assert.match(middleware, /install-page\.html\?raw/);
  assert.match(middleware, /virtual:helion-og-identity/);
  assert.match(middleware, /export default/);
  readFileSync(join(TEMPLATE_ROOT, "scripts/install-page.html"));
  readFileSync(join(TEMPLATE_ROOT, "public/__helion/icon-180.png"));
  readFileSync(join(TEMPLATE_ROOT, "public/__helion/install/styles.css"));
});

test("vite plugin bakes og identity as a virtual module", () => {
  const plugin = readFileSync(join(TEMPLATE_ROOT, "scripts/helion-pwa-plugin.mjs"), "utf8");
  assert.match(plugin, /virtual:helion-og-identity/);
  assert.match(plugin, /snapshotOgIdentity/);
});
