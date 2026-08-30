import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPreferencesFn, updatePreferencesFn } from "./functions";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  normalizePreferences,
  type UserPreferences,
} from "./types";

/**
 * Client-safe preference persistence, split by auth state:
 *   - LOGGED OUT  -> localStorage (key PREFERENCES_STORAGE_KEY). Never calls the
 *                    server, so the page never errors and never forces login.
 *   - LOGGED IN   -> server-side (getPreferencesFn/updatePreferencesFn behind
 *                    authMiddleware) so the value survives across sessions.
 *
 * This module is client-only (uses window/localStorage + React hooks) but
 * imports NO server-only code — the server functions dynamically import their
 * server layer inside their own handlers.
 */

/** Read the logged-out preference store from localStorage (safe on SSR). */
export function readLocalPreferences(): UserPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Persist the logged-out preference store to localStorage. */
export function writeLocalPreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable (private mode / quota) — degrade silently; the
    // in-memory state still reflects the choice for this session.
  }
}

export type PreferencesController = {
  /** The effective preferences (default until loaded). */
  preferences: UserPreferences;
  /** True while the initial load resolves (session pending or server fetch). */
  isLoading: boolean;
  /** True once the user is known to be signed in (server-backed persistence). */
  isSignedIn: boolean;
  /** Update one preference; persists to the right store for the auth state. */
  setPreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => Promise<void>;
};

/**
 * Load + persist the current user's preferences, routing to localStorage
 * (logged out) or the server (logged in). Defaults to OFF until resolved, and
 * NEVER forces login — a server failure degrades to the local/default value.
 */
export function usePreferences(): PreferencesController {
  const { user, isPending } = useCurrentUserState();
  const isSignedIn = Boolean(user);
  // `useCurrentUserState()` builds a NEW `user` object literal on every render,
  // so depending on `user` itself would make the load effect below re-run every
  // render — refetching the server value and clobbering the just-toggled
  // optimistic state in a loop (the "stuck OFF / rapid flicker" bug). Key the
  // effect on the STABLE user id (a primitive) so it runs once per identity
  // change (sign in / sign out / account switch) and not on every render.
  const userId = user?.id ?? null;
  const [preferences, setPreferences] = useState<UserPreferences>({
    ...DEFAULT_PREFERENCES,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (isPending) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      // Logged out: localStorage only.
      setPreferences(readLocalPreferences());
      setIsLoading(false);
      return;
    }
    // Logged in: load server-side; degrade to default (never error) on failure.
    setIsLoading(true);
    void getPreferencesFn()
      .then((prefs) => {
        if (!cancelled) setPreferences(normalizePreferences(prefs));
      })
      .catch(() => {
        if (!cancelled) setPreferences({ ...DEFAULT_PREFERENCES });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, userId]);

  const setPreference = useCallback(
    async <K extends keyof UserPreferences>(
      key: K,
      value: UserPreferences[K],
    ) => {
      // Compute + apply the optimistic value from the LATEST state via the
      // functional updater so this callback never depends on `preferences`
      // (which would recreate it every render). `next` is captured for the
      // persistence step below.
      let next: UserPreferences = { ...DEFAULT_PREFERENCES };
      setPreferences((current) => {
        next = { ...current, [key]: value };
        return next;
      });
      if (isSignedIn) {
        try {
          const saved = await updatePreferencesFn({ data: next });
          setPreferences(normalizePreferences(saved));
        } catch {
          // Keep the optimistic value locally; server persistence failed but the
          // page must not error out.
        }
      } else {
        writeLocalPreferences(next);
      }
    },
    [isSignedIn],
  );

  return { preferences, isLoading, isSignedIn, setPreference };
}
