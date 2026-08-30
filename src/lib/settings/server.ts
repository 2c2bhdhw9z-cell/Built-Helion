import { getSql } from "@/lib/db";
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "./types.ts";

/**
 * Server-only DB access layer for per-user preferences. Imports getSql() (which
 * throws in the browser), so this module must NEVER be imported by client code
 * — the server functions in functions.ts import it dynamically inside their
 * handlers, and they run only for signed-in callers (authMiddleware).
 *
 * Logged-out users never reach this layer at all: their preferences live in
 * localStorage. All queries are parameterized. No mock/seeded data — an unknown
 * user returns the client-safe DEFAULT_PREFERENCES.
 */

type PreferencesRow = {
  autofill_feedback_email: boolean;
};

/**
 * The stored preferences for `userId`, or DEFAULT_PREFERENCES when the user has
 * never saved any (no row yet). Never throws for a missing row.
 */
export async function getPreferences(userId: string): Promise<UserPreferences> {
  const sql = await getSql();
  const rows = await sql<PreferencesRow>`
    select autofill_feedback_email
    from user_preferences
    where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return { ...DEFAULT_PREFERENCES };
  return { autofillFeedbackEmail: Boolean(row.autofill_feedback_email) };
}

/**
 * Insert or update the preferences for `userId` and return the persisted value.
 * Bumps updated_at so the row reflects the last change.
 */
export async function upsertPreferences(
  userId: string,
  prefs: UserPreferences,
): Promise<UserPreferences> {
  const sql = await getSql();
  const rows = await sql<PreferencesRow>`
    insert into user_preferences (user_id, autofill_feedback_email, updated_at)
    values (${userId}, ${prefs.autofillFeedbackEmail}, now())
    on conflict (user_id) do update set
      autofill_feedback_email = excluded.autofill_feedback_email,
      updated_at = now()
    returning autofill_feedback_email
  `;
  const row = rows[0];
  return { autofillFeedbackEmail: Boolean(row.autofill_feedback_email) };
}
