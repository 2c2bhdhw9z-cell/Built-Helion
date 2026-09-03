import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { choosePlanFn, getBillingFn } from "./functions";
import { DEFAULT_BILLING, type BillingState, type PlanId } from "./types";

export type BillingController = {
  billing: BillingState;
  isLoading: boolean;
  isSignedIn: boolean;
  choosePlan: (plan: PlanId) => Promise<BillingState | null>;
  refresh: () => Promise<void>;
};

/**
 * Load the signed-in caller's plan + trial. Signed-out visitors stay on the
 * free, unentitled default — Pro generators and 4K export stay locked until
 * they sign in (which auto-starts the 7-day trial).
 */
export function useBilling(): BillingController {
  const { user, isPending } = useCurrentUserState();
  const isSignedIn = Boolean(user);
  const userId = user?.id ?? null;
  const [billing, setBilling] = useState<BillingState>({ ...DEFAULT_BILLING });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBilling({ ...DEFAULT_BILLING });
      return;
    }
    try {
      const next = await getBillingFn();
      setBilling(next);
    } catch {
      setBilling({ ...DEFAULT_BILLING });
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (isPending) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setBilling({ ...DEFAULT_BILLING });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void getBillingFn()
      .then((next) => {
        if (!cancelled) setBilling(next);
      })
      .catch(() => {
        if (!cancelled) setBilling({ ...DEFAULT_BILLING });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, userId]);

  const choosePlan = useCallback(
    async (plan: PlanId): Promise<BillingState | null> => {
      if (!isSignedIn) return null;
      try {
        const next = await choosePlanFn({ data: { plan } });
        setBilling(next);
        return next;
      } catch {
        return null;
      }
    },
    [isSignedIn],
  );

  return { billing, isLoading, isSignedIn, choosePlan, refresh };
}
