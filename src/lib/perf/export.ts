import type { PerfSample } from "./ring-buffer.ts";
import type { PerfSummary } from "./stats.ts";
import type { DeviceInfo, GpuInfo, PerformanceMemoryInfo } from "./env-info.ts";

/**
 * System snapshot bundled with an export. All fields are honest readings or
 * availability flags; nothing here is fabricated.
 */
export type PerfSystemInfo = {
  backend: string;
  compute: string;
  devicePixelRatio?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  gpu: GpuInfo;
  device: DeviceInfo;
  memory: PerformanceMemoryInfo;
};

export type PerfExportPayload = {
  /** ISO timestamp of when the export was produced. */
  generatedAt: string;
  /** Number of frames captured in the window. */
  window: number;
  summary: PerfSummary;
  system: PerfSystemInfo;
  samples: PerfSample[];
};

/**
 * Serialize a perf export to pretty-printed JSON. Pure. No PII beyond the
 * device/user-agent strings the caller chooses to include; no server round-trip.
 */
export function toJsonExport(payload: PerfExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Column order for the CSV per-frame table. */
export const CSV_COLUMNS: (keyof PerfSample)[] = [
  "t",
  "fps",
  "frameMs",
  "computeMs",
  "renderMs",
  "other",
  "live",
  "sleeping",
  "cap",
  "ramBytes",
  "drawCalls",
  "drawnPoints",
  "nanCount",
  "oobCount",
];

function csvCell(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

/**
 * Serialize per-frame samples to CSV with a header row. Pure. Empty input still
 * yields the header row (so the file is well-formed). Rows are ordered as given
 * (caller passes oldest -> newest).
 */
export function toCsvExport(samples: PerfSample[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = samples.map((s) =>
    CSV_COLUMNS.map((col) => csvCell(s[col])).join(","),
  );
  return [header, ...rows].join("\n");
}

/**
 * Browser-only helper that triggers a client-side download of `text`. Guarded on
 * `typeof document` so importing/calling it under SSR/node is a safe no-op. Not
 * unit tested (DOM side-effect only).
 */
export function downloadBlob(
  filename: string,
  mime: string,
  text: string,
): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Browser-only helper that triggers a client-side download of an already-built
 * `Blob` (e.g. a PNG/WebM from a canvas or MediaRecorder). Mirrors `downloadBlob`
 * but takes the Blob directly instead of a string body. Guarded on
 * `typeof document`/`URL` so importing/calling it under SSR/node is a safe no-op.
 * Not unit tested (DOM side-effect only).
 */
export function downloadBlobObject(filename: string, blob: Blob): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
