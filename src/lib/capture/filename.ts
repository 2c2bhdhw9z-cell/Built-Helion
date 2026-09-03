/** File extension per capture kind. */
export type CaptureKind = "png" | "jpg" | "gif" | "webm";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Build a human-readable, sortable capture filename of the form
 * `helion-YYYYMMDD-HHMMSS.<ext>` using zero-padded LOCAL-time components.
 *
 * Pure and SSR/node-safe: accepts an injectable `now` Date for deterministic
 * tests (defaults to the current time). Mirrors the naming spirit of the perf
 * export's `helion-perf-${Date.now()}` but with a readable timestamp.
 */
export function captureFilename(kind: CaptureKind, now: Date = new Date()): string {
  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const s = pad2(now.getSeconds());
  return `helion-${y}${mo}${d}-${h}${mi}${s}.${kind}`;
}
