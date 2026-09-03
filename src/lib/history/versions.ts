import type { CreationConfig } from "@/lib/creations/types";
import { normalizeCreationConfig } from "@/lib/creations/types";

export type VersionEntry = {
  id: string;
  at: number;
  name: string;
  config: CreationConfig;
};

const KEY = "helion.versions";
const LIMIT = 40;

function readAll(): VersionEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: VersionEntry[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as { id?: unknown; at?: unknown; name?: unknown; config?: unknown };
      if (typeof r.id !== "string" || typeof r.at !== "number" || typeof r.name !== "string") continue;
      const config = normalizeCreationConfig(r.config);
      if (!config) continue;
      out.push({ id: r.id, at: r.at, name: r.name.slice(0, 80), config });
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(rows: VersionEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, LIMIT)));
  } catch {
    /* quota / private mode */
  }
}

export function listVersions(): VersionEntry[] {
  return readAll();
}

export function pushVersion(name: string, config: CreationConfig): VersionEntry {
  const entry: VersionEntry = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}`,
    at: Date.now(),
    name: name.trim().slice(0, 80) || "Untitled",
    config,
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
