import { useEffect } from "react";
import { Toaster } from "sonner";
import { applyAccessibility, applyTheme, usePreferences } from "@/lib/settings/use-preferences";
import { useBilling } from "@/lib/billing/use-billing";
import { useLab } from "@/store/lab-store";

/**
 * Apply the stored theme + accessibility prefs (Item 18) to <html> so CSS tokens
 * and the Toaster stay in sync. Also re-applies the effective reduced-motion
 * state when the OS `prefers-reduced-motion` media query flips while the "system"
 * mode is active, so the choice tracks the system without a reload.
 */
export function ThemeSync() {
  const { preferences } = usePreferences();
  useEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);
  useEffect(() => {
    applyAccessibility(preferences);
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => applyAccessibility(preferences);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [preferences]);
  return null;
}

export function ThemeToaster() {
  const { preferences } = usePreferences();
  return (
    <Toaster
      theme={preferences.theme === "light" ? "light" : "dark"}
      position="bottom-right"
      richColors
    />
  );
}

/** Mirror the signed-in plan/trial onto the lab store so generators/export can gate. */
export function BillingSync() {
  const { billing } = useBilling();
  const setEntitled = useLab((s) => s.setEntitled);
  const setPlan = useLab((s) => s.setPlan);
  useEffect(() => {
    setEntitled(billing.entitled);
    setPlan(billing.plan);
  }, [billing.entitled, billing.plan, setEntitled, setPlan]);
  return null;
}
