/** Studio mark on free exports. Replaces the default HELION word. */

import { kv } from "./platform/storage.ts";

export type Brand = {
  label: string;
};

const KEY = "helion.brand";
const DEFAULT_LABEL = "HELION";

export function readBrand(): Brand {
  try {
    const raw = kv().get(KEY);
    if (!raw) return { label: DEFAULT_LABEL };
    const parsed = JSON.parse(raw) as Partial<Brand>;
    const label = typeof parsed.label === "string" ? parsed.label.trim().slice(0, 24) : "";
    return { label: label || DEFAULT_LABEL };
  } catch {
    return { label: DEFAULT_LABEL };
  }
}

export function writeBrand(label: string): Brand {
  const next: Brand = { label: label.trim().slice(0, 24) || DEFAULT_LABEL };
  try {
    kv().set(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}
