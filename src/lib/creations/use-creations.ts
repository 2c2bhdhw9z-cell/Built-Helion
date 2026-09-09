import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  deleteCreationFn,
  listCreationsFn,
  saveCreationFn,
  setCreationPublicFn,
  updateCreationFn,
} from "./functions";
import { currentCreationConfig, useLab } from "@/store/lab-store";
import type { CreationRow, UpdateCreationResult } from "./types";

/**
 * Outcome of a save from the UI's perspective (Item 23). `"saved"` stored the
 * row; `"limit"` means the free private-creation quota is full (offer upgrade),
 * with `limit` echoing the ceiling; `"error"` is a signed-out no-op or a
 * transient failure.
 */
export type SaveOutcome =
  | { status: "saved" }
  | { status: "limit"; limit: number }
  | { status: "error" };

/**
 * Client-safe hook for a signed-in user's saved creations.
 *
 *   - LOGGED OUT -> `creations` is empty and save/remove are no-ops. The UI
 *                   gates on `isSignedIn` and shows a "sign in to save" prompt,
 *                   so nothing here ever forces login or blocks the sim.
 *   - LOGGED IN  -> list/save/delete run server-side behind authMiddleware, so
 *                   creations survive across sessions and are owner-scoped.
 *
 * Degrades gracefully: a server failure leaves the list as-is (empty on first
 * load) and surfaces a boolean result to the caller rather than throwing to the
 * page. This module imports NO server-only code — the server functions
 * dynamically import their own server layer.
 */
export type CreationsController = {
  /** The signed-in user's creations, newest first (empty when signed out). */
  creations: CreationRow[];
  /** True while the initial list load resolves (session pending or fetch). */
  isLoading: boolean;
  /** True once the user is known to be signed in. */
  isSignedIn: boolean;
  /** Re-fetch the list from the server (no-op when signed out). */
  refresh: () => Promise<void>;
  /**
   * Snapshot the current sim and save it under `name`. Returns a discriminated
   * result: `"saved"` on success, `"limit"` when a free user is at the private-
   * creation quota (the UI should offer an upgrade), or `"error"` on a
   * transient failure / signed-out no-op.
   */
  save: (name: string) => Promise<SaveOutcome>;
  /**
   * Update an existing creation IN PLACE with the current sim, resolving a
   * cross-device save conflict via "newer wins with a warning" (Req 2). Sends
   * the row's last-loaded `updated_at` as the base; the server refuses to
   * overwrite when a newer version exists and returns a `conflict` status the
   * caller surfaces as a non-destructive warning. Returns `null` when signed
   * out or on a transient failure (no state change).
   */
  update: (row: CreationRow) => Promise<UpdateCreationResult | null>;
  /** Delete one of the user's creations by id. Returns true on success. */
  remove: (id: string) => Promise<boolean>;
  /** Publish or unpublish a creation into the community library. */
  setPublic: (id: string, isPublic: boolean) => Promise<boolean>;
};

export function useCreations(): CreationsController {
  const { user, isPending } = useCurrentUserState();
  const isSignedIn = Boolean(user);
  // `useCurrentUserState()` builds a NEW `user` object literal every render, so
  // depending on `user` itself would re-run the load effect on every render.
  // Key it on the STABLE user id (a primitive) so it runs once per identity
  // change (sign in / out / account switch). See use-preferences.ts.
  const userId = user?.id ?? null;

  const [creations, setCreations] = useState<CreationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCreations([]);
      return;
    }
    try {
      const rows = await listCreationsFn();
      setCreations(rows);
    } catch {
      // Never throw to the page. On a transient fetch failure, RETAIN the last
      // successfully loaded set instead of discarding it — a sync failure must
      // not drop local data (Req 2.4). We only clear to [] when the user is
      // signed out (handled by the early return above).
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (isPending) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setCreations([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void listCreationsFn()
      .then((rows) => {
        if (!cancelled) setCreations(rows);
      })
      .catch(() => {
        // Retain the last successfully loaded set on a failed fetch instead of
        // clearing to [] — a sync failure must not discard data (Req 2.4). The
        // signed-out case clears to [] via the `!userId` branch above.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, userId]);

  const save = useCallback(
    async (name: string): Promise<SaveOutcome> => {
      if (!isSignedIn) return { status: "error" };
      const config = currentCreationConfig(useLab.getState());
      try {
        const result = await saveCreationFn({ data: { name, config } });
        if (result.status === "limit") {
          return { status: "limit", limit: result.limit };
        }
        // Prepend the new row (server lists newest first).
        setCreations((prev) => [result.row, ...prev]);
        return { status: "saved" };
      } catch {
        return { status: "error" };
      }
    },
    [isSignedIn],
  );

  const update = useCallback(
    async (row: CreationRow): Promise<UpdateCreationResult | null> => {
      if (!isSignedIn) return null;
      const config = currentCreationConfig(useLab.getState());
      try {
        const result = await updateCreationFn({
          data: {
            id: row.id,
            name: row.name,
            config,
            baseUpdatedAt: row.updated_at,
          },
        });
        // On a successful save, swap the fresh row in; on a conflict, adopt the
        // server's current row (its newer `updated_at`) so a subsequent save
        // bases off the latest and the warning is not shown twice for the same
        // stale base. A "notfound" leaves the list untouched.
        if (result.status === "saved" || result.status === "conflict") {
          setCreations((prev) => prev.map((c) => (c.id === row.id ? result.row : c)));
        }
        return result;
      } catch {
        return null;
      }
    },
    [isSignedIn],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isSignedIn) return false;
      try {
        const { deleted } = await deleteCreationFn({ data: { id } });
        if (deleted) setCreations((prev) => prev.filter((c) => c.id !== id));
        return deleted;
      } catch {
        return false;
      }
    },
    [isSignedIn],
  );

  const setPublic = useCallback(
    async (id: string, isPublic: boolean): Promise<boolean> => {
      if (!isSignedIn) return false;
      try {
        const { ok } = await setCreationPublicFn({ data: { id, isPublic } });
        if (ok) {
          setCreations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, is_public: isPublic } : c)),
          );
        }
        return ok;
      } catch {
        return false;
      }
    },
    [isSignedIn],
  );

  return { creations, isLoading, isSignedIn, refresh, save, update, remove, setPublic };
}
