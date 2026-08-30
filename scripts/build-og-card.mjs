/**
 * Build the Helion OG social card.
 *
 * Deterministically authors a 1200x630 "particle galaxy" SVG on a deep
 * space-black (#08090c) background using the app's own rainbow palette tones
 * (see src/engine/palettes.ts), writes the SVG source to scripts/og-card.svg,
 * then rasterizes it to public/og.jpg (JPEG, quality 85) with puppeteer.
 *
 * Run: node scripts/build-og-card.mjs
 *
 * The art is fully deterministic (fixed seed), so re-running produces an
 * identical SVG. Only the JPEG re-encode is done by Chromium.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Vendored, OFL-licensed IBM Plex faces (Latin subset - the card only uses
// A-Z + space). Inlined as base64 @font-face so the wordmark/tagline render in
// the true typeface on any machine, without relying on a system install.
const ibmPlexSans600 = readFileSync(
  resolve(__dirname, "fonts/ibm-plex-sans-600.woff2"),
).toString("base64");
const ibmPlexMono600 = readFileSync(
  resolve(__dirname, "fonts/ibm-plex-mono-600.woff2"),
).toString("base64");

const fontFaceCss = `
    @font-face {
      font-family: 'IBM Plex Sans';
      font-style: normal;
      font-weight: 600;
      src: url(data:font/woff2;base64,${ibmPlexSans600}) format('woff2');
    }
    @font-face {
      font-family: 'IBM Plex Mono';
      font-style: normal;
      font-weight: 600;
      src: url(data:font/woff2;base64,${ibmPlexMono600}) format('woff2');
    }`;

const WIDTH = 1200;
const HEIGHT = 630;

// Rainbow palette stops mirrored from src/engine/palettes.ts so the card art
// matches the running app's default palette.
const RAINBOW = [
  [220, 32, 64],
  [255, 128, 24],
  [255, 214, 48],
  [46, 196, 92],
  [36, 156, 255],
  [92, 72, 255],
  [188, 56, 210],
];

function samplePalette(t) {
  const clamped = Math.min(1, Math.max(0, t));
  const u = clamped * (RAINBOW.length - 1);
  const i = Math.min(RAINBOW.length - 2, Math.floor(u));
  const f = u - i;
  const a = RAINBOW[i];
  const b = RAINBOW[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

// Deterministic PRNG (mulberry32) with a fixed seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x48454c49); // "HELI"

const cx = WIDTH * 0.5;
const cy = HEIGHT * 0.5;

// Build a logarithmic-spiral vortex of glowing particles.
const dots = [];
const ARMS = 3;
const PARTICLES = 1400;
for (let i = 0; i < PARTICLES; i++) {
  const arm = i % ARMS;
  const p = i / PARTICLES;
  // radius grows outward; a bit of jitter for a natural nebula scatter
  const baseAngle = (arm / ARMS) * Math.PI * 2;
  const spin = p * Math.PI * 3.4; // how many turns
  const jitterA = (rand() - 0.5) * 0.55;
  const angle = baseAngle + spin + jitterA;
  const maxR = HEIGHT * 0.62;
  const r = Math.pow(p, 0.72) * maxR * (0.85 + rand() * 0.3);
  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r * 0.62; // squash vertically -> galaxy tilt
  // color follows radius through the rainbow, brighter near the core
  const [cr, cg, cb] = samplePalette(p);
  const size = 0.6 + rand() * (p < 0.25 ? 3.4 : 2.1);
  const opacity = (0.35 + rand() * 0.6) * (1 - p * 0.35);
  dots.push({ x, y, r: size, cr, cg, cb, opacity });
}

// A denser bright core of hot particles.
const coreDots = [];
for (let i = 0; i < 260; i++) {
  const angle = rand() * Math.PI * 2;
  const r = Math.pow(rand(), 1.8) * HEIGHT * 0.16;
  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r * 0.7;
  const [dr, dg, db] = samplePalette(0.12 + rand() * 0.2);
  coreDots.push({
    x,
    y,
    r: 0.5 + rand() * 1.8,
    cr: Math.min(255, dr + 40),
    cg: Math.min(255, dg + 40),
    cb: Math.min(255, db + 40),
    opacity: 0.5 + rand() * 0.5,
  });
}

// Faint background starfield.
const stars = [];
for (let i = 0; i < 220; i++) {
  stars.push({
    x: rand() * WIDTH,
    y: rand() * HEIGHT,
    r: rand() * 1.1 + 0.2,
    opacity: 0.08 + rand() * 0.5,
  });
}

const dotSvg = [...dots, ...coreDots]
  .map(
    (d) =>
      `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(
        2,
      )}" fill="rgb(${d.cr},${d.cg},${d.cb})" opacity="${d.opacity.toFixed(2)}"/>`,
  )
  .join("");

const starSvg = stars
  .map(
    (s) =>
      `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(
        2,
      )}" fill="#dfe6ff" opacity="${s.opacity.toFixed(2)}"/>`,
  )
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <style type="text/css">${fontFaceCss}
    </style>
    <radialGradient id="space" cx="50%" cy="48%" r="75%">
      <stop offset="0%" stop-color="#12131b"/>
      <stop offset="55%" stop-color="#0b0c12"/>
      <stop offset="100%" stop-color="#08090c"/>
    </radialGradient>
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff4dc" stop-opacity="0.95"/>
      <stop offset="18%" stop-color="#ffd630" stop-opacity="0.6"/>
      <stop offset="42%" stop-color="#ff8018" stop-opacity="0.28"/>
      <stop offset="70%" stop-color="#5c48ff" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#08090c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rimGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#249cff" stop-opacity="0"/>
      <stop offset="72%" stop-color="#5c48ff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#bc38d2" stop-opacity="0"/>
    </radialGradient>
    <filter id="soften" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="0.6"/>
    </filter>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#space)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#08090c" opacity="0"/>

  <g>${starSvg}</g>

  <ellipse cx="${cx}" cy="${cy}" rx="${HEIGHT * 0.72}" ry="${HEIGHT * 0.5}" fill="url(#rimGlow)"/>

  <g style="mix-blend-mode:screen" filter="url(#soften)">${dotSvg}</g>

  <ellipse cx="${cx}" cy="${cy}" rx="${HEIGHT * 0.42}" ry="${
    HEIGHT * 0.3
  }" fill="url(#coreGlow)" style="mix-blend-mode:screen"/>

  <g text-anchor="middle" style="mix-blend-mode:normal">
    <text x="${cx}" y="${
      cy + 18
    }" font-family="'IBM Plex Sans','IBM Plex Mono',system-ui,sans-serif" font-size="132" font-weight="600" letter-spacing="34" fill="#f6f8ff" style="paint-order:stroke;">HELION</text>
    <text x="${cx}" y="${
      cy + 76
    }" font-family="'IBM Plex Mono',ui-monospace,monospace" font-size="30" font-weight="600" letter-spacing="13" fill="#b8c2e0">GPU PARTICLE LABORATORY</text>
  </g>
</svg>`;

const svgPath = resolve(repoRoot, "scripts/og-card.svg");
writeFileSync(svgPath, svg + "\n", "utf8");
console.log("wrote", svgPath);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss}
  html,body{margin:0;padding:0;background:#08090c;}
  svg{display:block;}
</style></head><body>${svg}</body></html>`;

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  // Give the web fonts a moment to load for crisp glyphs.
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  const outPath = resolve(repoRoot, "public/og.jpg");
  await page.screenshot({
    path: outPath,
    type: "jpeg",
    quality: 85,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });
  console.log("wrote", outPath);
} finally {
  await browser.close();
}
