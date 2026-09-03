import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPreferencesFn, updatePreferencesFn } from "./functions";
import { kv } from "@/lib/platform/storage";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  normalizePreferences,
  type ThemeId,
  type UserPreferences,
} from "./types";

/**
 * Client-safe preference persistence, split by auth state:
 *   - LOGGED OUT  -> platform KV (key PREFERENCES_STORAGE_KEY). Never calls the
 *                    server, so the page never errors and never forces login.
 *   - LOGGED IN   -> server-side (getPreferencesFn/updatePreferencesFn behind
 *                    authMiddleware) so the value survives across sessions.
 *
 * This module is client-only (uses platform KV + React hooks) but
 * imports NO server-only code — the server functions dynamically import their
 * server layer inside their own handlers.
 */

export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  const next = theme === "light" ? "light" : "dark";
  const root = document.documentElement;
  root.dataset.theme = next;
  root.classList.toggle("dark", next === "dark");
  root.classList.toggle("light", next === "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "light" ? "#f4f1ea" : "#08090c");
}

/**
 * Build the value to persist for a single-preference change: the current
 * preferences with `key` overridden by `value`. Kept as a pure exported helper
 * so the "the write persists the value the user just chose" contract is unit
 * testable WITHOUT React. `setPreference` must compute this SYNCHRONOUSLY from
 * the latest known preferences (not inside an async `setPreferences` updater),
 * or the value captured for the network/KV write is the stale default
 * — the regression where the toggle turned ON then immediately snapped OFF.
 */
export function nextPreferences<K extends keyof UserPreferences>(
  current: UserPreferences,
  key: K,
  value: UserPreferences[K],
): UserPreferences {
  return { ...current, [key]: value };
}

/** Read the logged-out preference store from platform KV (safe on SSR). */
export function readLocalPreferences(): UserPreferences {
  try {
    const raw = kv().get(PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Persist the logged-out preference store through platform KV. */
export function writeLocalPreferences(prefs: UserPreferences): void {
  try {
    kv().set(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
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
 * Load + persist the current user's preferences, routing to platform KV
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
  // Mirror the latest preferences in a ref so `setPreference` can read the
  // current value SYNCHRONOUSLY when it builds the value to persist. A
  // functional `setPreferences` updater cannot be used for that: React does not
  // run the updater synchronously during the event handler, so the value the
  // network/KV write captured would be the stale initial default
  // (the "toggle turns on then snaps back OFF" bug — the write persisted the
  // default `false` regardless of the click, and the reload read it back).
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  useEffect(() => {
    let cancelled = false;
    if (isPending) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      // Logged out: platform KV only.
      const local = readLocalPreferences();
      setPreferences(local);
      applyTheme(local.theme);
      setIsLoading(false);
      return;
    }
    // Logged in: load server-side; degrade to default (never error) on failure.
    setIsLoading(true);
    void getPreferencesFn()
      .then((prefs) => {
        if (cancelled) return;
        const next = normalizePreferences(prefs);
        setPreferences(next);
        applyTheme(next.theme);
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
      // Compute the next value SYNCHRONOUSLY from the latest preferences (read
      // via the ref, so this callback stays stable and does not depend on
      // `preferences`). Applying it optimistically AND persisting it must both
      // use this same concrete value — reading it back out of an async
      // `setPreferences` updater would race and capture the stale default.
      const next = nextPreferences(preferencesRef.current, key, value);
      preferencesRef.current = next;
      setPreferences(next);
      if (key === "theme") applyTheme(next.theme);
      if (isSignedIn) {
        try {
          const saved = await updatePreferencesFn({ data: next });
          const normalized = normalizePreferences(saved);
          setPreferences(normalized);
          if (key === "theme") applyTheme(normalized.theme);
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
