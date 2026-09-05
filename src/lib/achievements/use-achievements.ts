import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listAchievementsFn } from "./functions";
import type { GrantedAchievement } from "./types.ts";

/**
 * Client-safe labels for granted achievements.
 *
 * The authoritative achievement definitions (id → label) live in the static
 * ACHIEVEMENTS table in `server.ts`, but that module is server-only (it imports
 * `@/lib/db`) and MUST NOT be pulled into the client bundle. The server function
 * returns only `{ id, grantedAt }` per grant, so this small client-safe map
 * turns those ids into human-readable labels for the achievements UI. Keep the
 * ids here in sync with the `ACHIEVEMENTS` table in `server.ts`; an id with no
 * entry falls back to the id itself so a new server-side achievement still
 * renders (just without a friendly label) rather than breaking the UI.
 */
export const ACHIEVEMENT_LABELS: Record<string, string> = {
  million: "One Million Particles",
  "day-session": "24-Hour Session",
};

/** Human-readable label for a granted achievement id (falls back to the id). */
export function achievementLabel(id: string): string {
  return ACHIEVEMENT_LABELS[id] ?? id;
}

/**
 * Client-safe hook for a signed-in user's granted achievements.
 *
 *   - LOGGED OUT -> `achievements` is an EMPTY set `[]`. It never calls the
 *                   server, never forces sign-in, and never blocks the
 *                   simulator (Req 8.5).
 *   - LOGGED IN  -> lists the account's granted achievements via
 *                   `listAchievementsFn`, which runs server-side behind
 *                   `authMiddleware` (Req 8.4).
 *
 * Modeled on `use-creations.ts`: it reads `useCurrentUserState()` and keys the
 * load effect on the STABLE `userId` primitive (not the per-render `user`
 * object) so it runs once per identity change. Degrades gracefully — a server
 * failure retains the last loaded set rather than throwing to the page. Imports
 * NO server-only code; the server function dynamically imports its own server
 * layer.
 */
export type AchievementsController = {
  /** The signed-in user's granted achievements (empty when signed out). */
  achievements: GrantedAchievement[];
  /** True while the initial list load resolves (session pending or fetch). */
  isLoading: boolean;
  /** True once the user is known to be signed in. */
  isSignedIn: boolean;
  /** Re-fetch the granted set from the server (no-op when signed out). */
  refresh: () => Promise<void>;
};

export function useAchievements(): AchievementsController {
  const { user, isPending } = useCurrentUserState();
  const isSignedIn = Boolean(user);
  // `useCurrentUserState()` builds a NEW `user` object literal every render, so
  // key the load effect on the STABLE user id (a primitive) — it then runs once
  // per identity change (sign in / out / account switch), mirroring
  // use-creations.ts.
  const userId = user?.id ?? null;

  const [achievements, setAchievements] = useState<GrantedAchievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      // Signed out: empty set, no server call, never blocks the sim (Req 8.5).
      setAchievements([]);
      return;
    }
    try {
      const rows = await listAchievementsFn();
      setAchievements(rows);
    } catch {
      // Never throw to the page. On a transient fetch failure, RETAIN the last
      // successfully loaded set instead of discarding it. We only clear to []
      // when the user is signed out (handled by the early return above).
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (isPending) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      // Signed out: empty set, never blocks the simulator (Req 8.5).
      setAchievements([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void listAchievementsFn()
      .then((rows) => {
        if (!cancelled) setAchievements(rows);
      })
      .catch(() => {
        // Retain the last successfully loaded set on a failed fetch. The
        // signed-out case clears to [] via the `!userId` branch above.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, userId]);

  return { achievements, isLoading, isSignedIn, refresh };
}
