import { useEffect } from "react";
import { Toaster } from "sonner";
import { applyTheme, usePreferences } from "@/lib/settings/use-preferences";
import { useBilling } from "@/lib/billing/use-billing";
import { useLab } from "@/store/lab-store";

/** Apply the stored theme to <html> so CSS tokens and the Toaster stay in sync. */
export function ThemeSync() {
  const { preferences } = usePreferences();
  useEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);
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
  useEffect(() => {
    setEntitled(billing.entitled);
  }, [billing.entitled, setEntitled]);
  return null;
}
