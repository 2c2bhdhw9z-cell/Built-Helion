import type { CreationConfig } from "@/lib/creations/types";
import { normalizeCreationConfig } from "@/lib/creations/types";
import { kv } from "../platform/storage.ts";

export type VersionEntry = {
  id: string;
  at: number;
  name: string;
  config: CreationConfig;
  /**
   * Optional small preview image (a downscaled JPEG dataURL) for the history
   * timeline (Item 15). Omitted on older entries and on saves where no engine
   * canvas was available; the timeline falls back to a placeholder tile.
   */
  thumb?: string;
};

const KEY = "helion.versions";
const LIMIT = 40;

function readAll(): VersionEntry[] {
  try {
    const raw = kv().get(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: VersionEntry[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as {
        id?: unknown;
        at?: unknown;
        name?: unknown;
        config?: unknown;
        thumb?: unknown;
      };
      if (typeof r.id !== "string" || typeof r.at !== "number" || typeof r.name !== "string") continue;
      const config = normalizeCreationConfig(r.config);
      if (!config) continue;
      const entry: VersionEntry = { id: r.id, at: r.at, name: r.name.slice(0, 80), config };
      if (typeof r.thumb === "string" && r.thumb.startsWith("data:")) entry.thumb = r.thumb;
      out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(rows: VersionEntry[]): void {
  try {
    kv().set(KEY, JSON.stringify(rows.slice(0, LIMIT)));
  } catch {
    /* quota / private mode */
  }
}

export function listVersions(): VersionEntry[] {
  return readAll();
}

export function pushVersion(
  name: string,
  config: CreationConfig,
  thumb?: string,
): VersionEntry {
  const entry: VersionEntry = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}`,
    at: Date.now(),
    name: name.trim().slice(0, 80) || "Untitled",
    config,
    ...(thumb && thumb.startsWith("data:") ? { thumb } : {}),
  };
  const next = [entry, ...readAll()].slice(0, LIMIT);
  writeAll(next);
  return entry;
}

export function removeVersion(id: string): void {
  writeAll(readAll().filter((row) => row.id !== id));
}

export function getVersion(id: string): VersionEntry | null {
  return readAll().find((row) => row.id === id) ?? null;
}
