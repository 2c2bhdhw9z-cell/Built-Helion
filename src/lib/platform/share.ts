import { copyText } from "./clipboard.ts";

export type ShareResult = "shared" | "copied" | "aborted" | "failed";

/**
 * Native share sheet when the shell has one (installed PWA, later Capacitor
 * Share / Tauri). Otherwise copy. Never fabricates a destination.
 */
export async function shareOrCopy(title: string, url: string): Promise<ShareResult> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, url });
      return "shared";
    }
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") return "aborted";
  }
  return (await copyText(url)) ? "copied" : "failed";
}
