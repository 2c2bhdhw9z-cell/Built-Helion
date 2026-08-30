import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signInEmail, signInSocial, signUpEmail } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

/**
 * Sign-in / sign-up surface for the self-hosted Better Auth.
 *
 * Auth is OPTIONAL: this route exists for visitors who WANT an account (e.g. to
 * use per-user settings later), but nothing forces anyone here — the sim and
 * feedback work fully signed out. Email/password always works; the "Continue
 * with Google" button appears only when the owner configured Google (resolved
 * server-side via `authProvidersFn`, so no secrets reach the client).
 */
export const Route = createFileRoute("/login")({
  component: LoginPage,
  loader: async () => {
    try {
      // Import the server fn dynamically INSIDE the loader (not at module top
      // level) so its `createServerFn(...).handler(createSsrRpc(...))` call is
      // not co-located into the route-tree SSR chunk. That top-level call in the
      // route-tree chunk formed a circular ESM chunk dependency with the chunk
      // that defines `createSsrRpc`, throwing `TypeError: createSsrRpc is not a
      // function` in loadEntries() and 500ing every route. Keep the graceful
      // fallback below so the page never blocks on a metadata failure.
      const { authProvidersFn } = await import("@/lib/auth/functions");
      return await authProvidersFn();
    } catch {
      // Never block the page on a metadata failure — fall back to
      // email/password only.
      return { emailAndPassword: true, social: [] };
    }
  },
});

/**
 * Official multicolor Google "G" mark, hand-authored inline SVG.
 *
 * Rendered at the canonical 4 brand colors (blue/green/yellow/red) per Google's
 * brand guidelines — we do NOT recolor it to match the dark theme; the button
 * chrome (outline variant) carries the site aesthetic instead. lucide-react has
 * no brand logos, so this stays a plain SVG with no new dependency.
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

const fieldClass =
  "w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-2xs uppercase tracking-[0.12em] text-faint";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

const signUpSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

function LoginPage() {
  const providers = Route.useLoaderData();
  const router = useRouter();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [googleBusy, setGoogleBusy] = useState(false);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  // Already signed in — offer a way back to the sim (never trap the visitor).
  if (!isPending && user) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center shadow-xl">
          <p className="text-sm text-muted">
            Signed in as{" "}
            <span className="font-medium text-fg">
              {user.displayName ?? user.primaryEmail ?? "your account"}
            </span>
            .
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md bg-fg px-3 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Back to Helion
          </Link>
        </div>
      </main>
    );
  }

  const onSignIn = signInForm.handleSubmit(async (values) => {
    try {
      await signInEmail(values.email, values.password);
      toast.success("Signed in");
      router.navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    }
  });

  const onSignUp = signUpForm.handleSubmit(async (values) => {
    try {
      await signUpEmail({
        email: values.email,
        password: values.password,
        name: values.name,
      });
      toast.success("Account created");
      router.navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-up failed");
    }
  });

  const onGoogle = async (provider: string) => {
    setGoogleBusy(true);
    try {
      await signInSocial(provider, "/");
    } catch (err) {
      setGoogleBusy(false);
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    }
  };

  const submitting =
    signInForm.formState.isSubmitting || signUpForm.formState.isSubmitting;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
        <div className="mb-5 text-center">
          <Link
            to="/"
            className="text-sm font-medium tracking-[0.18em] text-fg hover:opacity-80"
          >
            HELION
          </Link>
          <h1 className="mt-3 text-lg font-medium">
            {mode === "sign-in" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-2xs text-faint">
            Optional — the sim and feedback work without an account.
          </p>
        </div>

        {providers.social.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {providers.social.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="md"
                className="w-full"
                disabled={googleBusy || submitting}
                onClick={() => void onGoogle(p.id)}
              >
                {p.id === "google" && !googleBusy && (
                  <GoogleIcon className="shrink-0" />
                )}
                {googleBusy ? "Redirecting…" : `Continue with ${p.label}`}
              </Button>
            ))}
            <div className="my-1 flex items-center gap-3 text-2xs text-faint">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        {mode === "sign-in" ? (
          <form onSubmit={onSignIn} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="si-email">
                Email
              </label>
              <input
                id="si-email"
                type="email"
                autoComplete="email"
                className={fieldClass}
                placeholder="you@example.com"
                {...signInForm.register("email")}
              />
              {signInForm.formState.errors.email && (
                <span className="text-2xs text-danger">
                  {signInForm.formState.errors.email.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="si-password">
                Password
              </label>
              <input
                id="si-password"
                type="password"
                autoComplete="current-password"
                className={fieldClass}
                placeholder="••••••••"
                {...signInForm.register("password")}
              />
              {signInForm.formState.errors.password && (
                <span className="text-2xs text-danger">
                  {signInForm.formState.errors.password.message}
                </span>
              )}
            </div>
            <Button
              type="submit"
              variant="default"
              size="md"
              className="mt-1 w-full"
              disabled={submitting}
            >
              {signInForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onSignUp} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="su-name">
                Name (optional)
              </label>
              <input
                id="su-name"
                type="text"
                autoComplete="name"
                className={fieldClass}
                placeholder="Your name"
                {...signUpForm.register("name")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="su-email">
                Email
              </label>
              <input
                id="su-email"
                type="email"
                autoComplete="email"
                className={fieldClass}
                placeholder="you@example.com"
                {...signUpForm.register("email")}
              />
              {signUpForm.formState.errors.email && (
                <span className="text-2xs text-danger">
                  {signUpForm.formState.errors.email.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="su-password">
                Password
              </label>
              <input
                id="su-password"
                type="password"
                autoComplete="new-password"
                className={fieldClass}
                placeholder="At least 8 characters"
                {...signUpForm.register("password")}
              />
              {signUpForm.formState.errors.password && (
                <span className="text-2xs text-danger">
                  {signUpForm.formState.errors.password.message}
                </span>
              )}
            </div>
            <Button
              type="submit"
              variant="default"
              size="md"
              className="mt-1 w-full"
              disabled={submitting}
            >
              {signUpForm.formState.isSubmitting
                ? "Creating…"
                : "Create account"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-2xs text-faint">
          {mode === "sign-in" ? (
            <>
              No account?{" "}
              <button
                type="button"
                className="text-fg underline-offset-4 hover:underline"
                onClick={() => setMode("sign-up")}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-fg underline-offset-4 hover:underline"
                onClick={() => setMode("sign-in")}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="mt-3 text-center text-2xs text-faint">
          <Link to="/" className="underline-offset-4 hover:underline">
            Continue without signing in
          </Link>
        </p>
      </div>
    </main>
  );
}
