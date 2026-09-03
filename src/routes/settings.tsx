import { createFileRoute, Link } from "@tanstack/react-router";
import { Switch } from "@/components/ui/switch";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { usePreferences } from "@/lib/settings/use-preferences";
import type { ThemeId, UserPreferences } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

/**
 * Settings screen. NOT gated behind login by design: a logged-out visitor can
 * open it and toggle the LOCAL preference (platform KV). A signed-in
 * visitor's preferences persist server-side (user_preferences) across sessions.
 *
 * The preference list is data-driven (PREFERENCE_ROWS) so adding a new toggle
 * later is a one-line change here plus the model/migration/persistence wiring.
 */
export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type ToggleRow = {
  key: keyof Pick<UserPreferences, "autofillFeedbackEmail">;
  label: string;
  description: string;
  /** True when this preference only takes effect while signed in. */
  requiresAccount?: boolean;
};

/** The preferences rendered in the "Preferences" section. */
const PREFERENCE_ROWS: ToggleRow[] = [
  {
    key: "autofillFeedbackEmail",
    label: "Auto-fill my email on feedback",
    description:
      "Pre-fill the feedback form's email field with your account email. Off by default; your email is only ever stored privately and never shown on the public board.",
    requiresAccount: true,
  },
];

const THEMES: { id: ThemeId; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

function SettingsPage() {
  const { user, isPending } = useCurrentUserState();
  const { preferences, isLoading, isSignedIn, setPreference } = usePreferences();

  return (
    <div className="h-dvh overflow-y-auto bg-bg text-fg">
      <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link
              to="/"
              className="text-sm font-medium tracking-[0.18em] text-fg hover:opacity-80"
            >
              HELION
            </Link>
            <h1 className="text-2xs uppercase tracking-[0.16em] text-faint">
              Settings
            </h1>
          </div>
          <Link
            to="/"
            className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-xs font-medium text-fg shadow-[0_0_0_1px_var(--color-border)] transition-colors hover:bg-elevated"
          >
            Back to sim
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4">
        {!isPending && !user && (
          <div className="mb-4 rounded-lg border border-dashed border-border px-4 py-3 text-2xs leading-relaxed text-faint">
            You are not signed in. Preferences are stored locally in this
            browser. Email auto-fill needs an account —{" "}
            <Link to="/login" className="text-fg underline-offset-4 hover:underline">
              sign in
            </Link>{" "}
            to enable it and sync your settings across sessions.
          </div>
        )}

        <section className="mb-4 rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Appearance</h2>
            <p className="text-2xs text-faint">
              Light chrome for daytime; the sim itself stays a particle stage.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-fg">Theme</p>
              <p className="mt-0.5 text-2xs leading-relaxed text-faint">
                Applies immediately. Saved with your other preferences.
              </p>
            </div>
            <div className="flex rounded-md bg-elevated p-0.5" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={preferences.theme === t.id}
                  data-testid={`theme-${t.id}`}
                  disabled={false}
                  onClick={() => void setPreference("theme", t.id)}
                  className={cn(
                    "h-8 min-w-16 rounded-sm px-3 text-2xs font-medium tracking-wide transition-colors",
                    preferences.theme === t.id ? "bg-fg text-accent-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Preferences</h2>
            <p className="text-2xs text-faint">
              {isSignedIn
                ? "Saved to your account and synced across sessions."
                : "Stored locally in this browser."}
            </p>
          </div>
          <ul>
            {PREFERENCE_ROWS.map((row) => {
              const disabled =
                isLoading || (row.requiresAccount ? !isSignedIn : false);
              return (
                <li
                  key={row.key}
                  className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <label
                      htmlFor={`pref-${row.key}`}
                      className="text-sm text-fg"
                    >
                      {row.label}
                    </label>
                    <p className="mt-0.5 text-2xs leading-relaxed text-faint">
                      {row.description}
                      {row.requiresAccount && !isSignedIn && (
                        <span className="ml-1 text-warn">
                          Sign in to use this.
                        </span>
                      )}
                    </p>
                  </div>
                  <Switch
                    id={`pref-${row.key}`}
                    checked={Boolean(preferences[row.key])}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      void setPreference(row.key, checked)
                    }
                    aria-label={row.label}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
