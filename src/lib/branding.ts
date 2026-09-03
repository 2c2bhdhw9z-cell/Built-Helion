/** Studio mark on free exports. Replaces the default HELION word. */

export type Brand = {
  label: string;
};

const KEY = "helion.brand";
const DEFAULT_LABEL = "HELION";

export function readBrand(): Brand {
  try {
    if (typeof localStorage === "undefined") return { label: DEFAULT_LABEL };
    const raw = localStorage.getItem(KEY);
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
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}
