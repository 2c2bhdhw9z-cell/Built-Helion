/**
 * Platform I/O boundary.
 *
 * Today: browser (and installed PWA).
 * Later, same interfaces — no rewrite of the lab:
 *   iOS / Android  — Capacitor WebView (Filesystem, Share, Preferences)
 *   Windows / macOS / Linux — Tauri WebView (fs, clipboard, store)
 *
 * Particle engine stays canvas / WebGPU inside that webview.
 * Call setKvStore / setSaveBlob / setCopyText from the native shell at boot.
 * Do not scatter localStorage, clipboard, or <a download> outside this folder.
 */

export { kv, setKvStore, newMemoryKv, cachedKv, type KvStore, type AsyncKvStore } from "./storage";
export { saveBlob, setSaveBlob, type SaveBlobFn } from "./files";
export { copyText, setCopyText, type CopyTextFn } from "./clipboard";
export { shareOrCopy, type ShareResult } from "./share";
export { runtimeKind, type RuntimeKind } from "./runtime";
