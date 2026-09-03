/**
 * Save a file the user asked for. Browser: a download. Native later:
 * Capacitor Filesystem / Share, or Tauri fs — plug in with setSaveBlob.
 * Never invent a file.
 */

export type SaveBlobFn = (filename: string, blob: Blob) => Promise<void>;

async function browserSaveBlob(filename: string, blob: Blob): Promise<void> {
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

let impl: SaveBlobFn = browserSaveBlob;

export function setSaveBlob(fn: SaveBlobFn | null): void {
  impl = fn ?? browserSaveBlob;
}

export async function saveBlob(filename: string, blob: Blob): Promise<void> {
  await impl(filename, blob);
}
