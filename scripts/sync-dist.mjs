import { existsSync, mkdirSync, cpSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const vercelOutputDir = join(root, ".vercel", "output");
const staticDir = join(vercelOutputDir, "static");

mkdirSync(distDir, { recursive: true });

if (existsSync(staticDir)) {
  cpSync(staticDir, distDir, { recursive: true });
}

if (existsSync(vercelOutputDir)) {
  const items = readdirSync(vercelOutputDir);
  for (const item of items) {
    const src = join(vercelOutputDir, item);
    const dest = join(distDir, item);
    if (!existsSync(dest)) {
      cpSync(src, dest, { recursive: true });
    }
  }
}

// Ensure index.html exists in dist for static file hosting
const indexHtmlPath = join(distDir, "index.html");
if (!existsSync(indexHtmlPath)) {
  let jsScript = "";
  let cssLink = "";
  
  const assetsDir = join(distDir, "assets");
  if (existsSync(assetsDir)) {
    const assetFiles = readdirSync(assetsDir);
    for (const f of assetFiles) {
      if (f.endsWith(".css")) {
        cssLink += `<link rel="stylesheet" href="/assets/${f}">\n`;
      } else if (f.startsWith("index-") && f.endsWith(".js")) {
        jsScript += `<script type="module" src="/assets/${f}"></script>\n`;
      }
    }
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="en" class="dark antialiased">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Helion</title>
  <meta name="theme-color" content="#08090c">
  <meta name="description" content="Helion is a GPU particle laboratory — orbital mechanics, SPH fluids, boids, cloth, and a million-particle SoA compute pipeline.">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
  ${cssLink}
</head>
<body class="bg-bg text-fg">
  <div id="root"></div>
  ${jsScript}
</body>
</html>`;

  writeFileSync(indexHtmlPath, htmlContent, "utf8");
}

console.log("[sync-dist] Successfully synchronized build artifacts to dist/");
