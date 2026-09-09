import { z } from "zod";

/**
 * Client-safe user preferences model + zod schema. This file MUST stay free of
 * any server-only imports (no @/lib/db, no server.ts) so the browser bundle,
 * the settings route, the feedback dialog, and the server functions can all
 * import it.
 *
 * The shape is a single object of named prefs so adding a new preference later
 * is a one-line change here (plus a column in the migration + a row in the
 * settings UI) — the persistence/UI code maps over this object generically.
 */
export type ThemeId = "dark" | "light";

/**
 * Reduced-motion preference (Item 18a). "system" defers to the
 * `prefers-reduced-motion` media query; "on"/"off" are explicit user overrides.
 * DEFAULT "system" so we honor the OS setting without surprising anyone.
 */
export type MotionPref = "system" | "on" | "off";

export type UserPreferences = {
  /**
   * When ON (and the user is signed in with an email), the feedback dialog
   * pre-fills the email field with the account email. DEFAULT OFF: an
   * unauthenticated or opted-out user's email field stays blank.
   */
  autofillFeedbackEmail: boolean;
  /** Lab chrome theme. DEFAULT dark — the sim is built as a dark instrument. */
  theme: ThemeId;
  /**
   * Reduced-motion mode (Item 18a). "system" follows the OS media query; "on"
   * forces reduced motion; "off" forces full motion. Applied to UI
   * transitions via a `data-reduced-motion` attribute on <html>.
   */
  reducedMotion: MotionPref;
  /**
   * High-contrast chrome (Item 18b). When ON, a `data-contrast="high"`
   * attribute on <html> swaps the token set to a higher-contrast palette.
   * DEFAULT OFF.
   */
  highContrast: boolean;
};

/** The safe default applied everywhere a preference is unknown. */
export const DEFAULT_PREFERENCES: UserPreferences = {
  autofillFeedbackEmail: false,
  theme: "dark",
  reducedMotion: "system",
  highContrast: false,
};

/** Platform KV key for the LOGGED-OUT preference store (client-only). Same key as the theme FOUC snippet. */
export const PREFERENCES_STORAGE_KEY = "helion.preferences";

/**
 * Validates/normalizes a preferences object from any source (platform KV,
 * server row, or a client update). Unknown/missing fields fall back to the
 * default, so a partially-populated or legacy value is always coerced to a
 * complete, valid shape.
 */
export const userPreferencesSchema = z.object({
  autofillFeedbackEmail: z.boolean().default(DEFAULT_PREFERENCES.autofillFeedbackEmail),
  theme: z.enum(["dark", "light"]).default(DEFAULT_PREFERENCES.theme),
  reducedMotion: z.enum(["system", "on", "off"]).default(DEFAULT_PREFERENCES.reducedMotion),
  highContrast: z.boolean().default(DEFAULT_PREFERENCES.highContrast),
});

/**
 * Parse an untrusted value into a complete UserPreferences, falling back to the
 * default on anything invalid. Safe to feed raw localStorage/JSON here.
 */
export function normalizePreferences(value: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_PREFERENCES };
}

/**
 * Resolve the EFFECTIVE reduced-motion state (Item 18a) from the user's stored
 * preference and the current `prefers-reduced-motion` media-query match. Pure so
 * it can be unit-tested without a DOM:
 *   - "on"  -> always reduce, regardless of the OS setting.
 *   - "off" -> never reduce, regardless of the OS setting.
 *   - "system" -> defer to the media query (`systemPrefersReduced`).
 */
export function resolveReducedMotion(
  pref: MotionPref,
  systemPrefersReduced: boolean,
): boolean {
  if (pref === "on") return true;
  if (pref === "off") return false;
  return systemPrefersReduced;
}
