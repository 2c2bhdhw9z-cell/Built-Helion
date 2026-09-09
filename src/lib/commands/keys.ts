/**
 * Pure keybinding model for the command registry (Item 16).
 *
 * A keybinding is a normalized, order-independent string like "mod+z",
 * "shift+mod+z", "space", "?", or "6". This module has NO store/DOM imports so
 * it is fully unit-testable: it turns a KeyboardEvent-shaped input into a
 * canonical keybinding string, and canonicalizes an authored binding so lookups
 * match regardless of the order the modifiers were written in.
 *
 * "mod" is the platform-agnostic Cmd(⌘)/Ctrl modifier — the existing canvas
 * handler already treats metaKey || ctrlKey the same, and this preserves that.
 */

/** The subset of a KeyboardEvent this module needs. Keeps it DOM-free/testable. */
export type KeyEventLike = {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

const MODIFIER_ORDER = ["mod", "alt", "shift"] as const;

/**
 * Normalize a single key token to the canonical form used in bindings:
 *   - upper/lower case letters collapse to lowercase ("Z" -> "z")
 *   - " " / "spacebar" -> "space"
 *   - "=" is treated as "+" (the unshifted plus key) and "_" as "-"
 * Everything else passes through lowercased so digits and "?" stay intact.
 */
export function normalizeKeyToken(key: string): string {
  const k = key.toLowerCase();
  if (k === " " || k === "spacebar" || k === "space") return "space";
  if (k === "=") return "+";
  if (k === "_") return "-";
  if (k === "esc") return "escape";
  return k;
}

/**
 * Canonicalize an authored binding string ("Shift+Mod+Z", "mod + Z") into the
 * stable form the matcher compares against: modifiers sorted into a fixed order
 * (mod, alt, shift), each segment normalized, joined by "+". Non-modifier tokens
 * keep their normalized value.
 */
export function canonicalizeBinding(binding: string): string {
  const parts = binding
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  // A literal "+" key authored as "shift++" or a trailing plus produces an empty
  // final token; re-add it so "mod++" (zoom in) is expressible.
  const hasLiteralPlus = binding.trim().endsWith("+") || binding.includes("++");
  const mods = new Set<string>();
  let mainKey = "";
  for (const p of parts) {
    if (p === "mod" || p === "cmd" || p === "meta" || p === "ctrl" || p === "control") mods.add("mod");
    else if (p === "alt" || p === "option") mods.add("alt");
    else if (p === "shift") mods.add("shift");
    else mainKey = normalizeKeyToken(p);
  }
  if (!mainKey && hasLiteralPlus) mainKey = "+";
  const orderedMods = MODIFIER_ORDER.filter((m) => mods.has(m));
  return [...orderedMods, mainKey].filter(Boolean).join("+");
}

/**
 * Build the canonical binding string that a KeyboardEvent represents, so it can
 * be looked up directly against a registry keyed by canonicalized bindings.
 * metaKey and ctrlKey both map to "mod" (Cmd on mac, Ctrl elsewhere).
 */
export function eventToBinding(e: KeyEventLike): string {
  const mods: string[] = [];
  if (e.metaKey || e.ctrlKey) mods.push("mod");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  // Prefer code "Space" so the space bar resolves even though e.key is " ".
  const main = e.code === "Space" ? "space" : normalizeKeyToken(e.key);
  const orderedMods = MODIFIER_ORDER.filter((m) => mods.includes(m));
  return [...orderedMods, main].filter(Boolean).join("+");
}

/**
 * A human-friendly label for a canonical binding, e.g. "mod+shift+z" ->
 * "⌘⇧Z" on mac-like platforms or "Ctrl+Shift+Z" otherwise. Pure: pass `mac`
 * explicitly so tests are deterministic.
 */
export function formatBinding(binding: string, mac = false): string {
  if (!binding) return "";
  const parts = binding.split("+");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "mod") out.push(mac ? "⌘" : "Ctrl");
    else if (p === "shift") out.push(mac ? "⇧" : "Shift");
    else if (p === "alt") out.push(mac ? "⌥" : "Alt");
    else if (p === "space") out.push("Space");
    else out.push(p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1));
  }
  return out.join(mac ? "" : "+");
}
