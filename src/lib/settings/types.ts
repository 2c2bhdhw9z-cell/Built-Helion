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

export type UserPreferences = {
  /**
   * When ON (and the user is signed in with an email), the feedback dialog
   * pre-fills the email field with the account email. DEFAULT OFF: an
   * unauthenticated or opted-out user's email field stays blank.
   */
  autofillFeedbackEmail: boolean;
  /** Lab chrome theme. DEFAULT dark — the sim is built as a dark instrument. */
  theme: ThemeId;
};

/** The safe default applied everywhere a preference is unknown. */
export const DEFAULT_PREFERENCES: UserPreferences = {
  autofillFeedbackEmail: false,
  theme: "dark",
};

/** localStorage key for the LOGGED-OUT preference store (client-only). */
export const PREFERENCES_STORAGE_KEY = "helion.preferences";

/**
 * Validates/normalizes a preferences object from any source (localStorage,
 * server row, or a client update). Unknown/missing fields fall back to the
 * default, so a partially-populated or legacy value is always coerced to a
 * complete, valid shape.
 */
export const userPreferencesSchema = z.object({
  autofillFeedbackEmail: z.boolean().default(DEFAULT_PREFERENCES.autofillFeedbackEmail),
  theme: z.enum(["dark", "light"]).default(DEFAULT_PREFERENCES.theme),
});

/**
 * Parse an untrusted value into a complete UserPreferences, falling back to the
 * default on anything invalid. Safe to feed raw localStorage/JSON here.
 */
export function normalizePreferences(value: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_PREFERENCES };
}
