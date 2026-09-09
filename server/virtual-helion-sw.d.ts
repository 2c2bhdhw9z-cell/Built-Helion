declare module "virtual:helion-sw" {
  /** The baked service-worker source (Req 9), served at `/sw.js` by the
   * deployed Nitro middleware. Rendered from scripts/service-worker.js with a
   * per-build cache version by scripts/helion-pwa-plugin.mjs. */
  export const serviceWorkerSource: string;
}
