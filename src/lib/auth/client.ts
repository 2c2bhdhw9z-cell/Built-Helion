import { createAuthClient } from "better-auth/react";
import { runSignOut } from "../../../scripts/sign-out-plan.mjs";
import { SOCIAL_PROVIDERS } from "./providers";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`. Sign-in is
 * REAL and self-hosted: email/password against the app's own DB, plus optional
 * Google OAuth (a normal full-page redirect to `/api/auth/*`). There is no
 * broker, no popup, and no bearer token — the session is a same-origin cookie.
 */
export const authClient = createAuthClient();

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`. Setting it to `"false"` selects the dev user (see
 * `use-current-user`) and hides sign-in.
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/** The social providers to render sign-in buttons for (client-safe list). */
export { SOCIAL_PROVIDERS };

/**
 * Legacy shim: this app used to attach a live-preview bearer token to requests.
 * Real self-hosted auth uses the same-origin session cookie, so there is no
 * token — this always returns `null`. Kept because `@/lib/auth/middleware`
 * forwards it (a no-op now) and removing it would churn that file.
 */
export function getBearerToken(): string | null {
  return null;
}

/**
 * Sign in with email + password against this app's Better Auth.
 * Resolves on success; rejects with a readable message on failure.
 */
export async function signInEmail(email: string, password: string): Promise<void> {
  const { error } = await authClient.signIn.email({ email, password });
  if (error) throw new Error(error.message ?? "Sign-in failed");
}

/**
 * Create a new email + password account, then sign in (Better Auth issues a
 * session on sign-up). Resolves on success; rejects with a readable message.
 */
export async function signUpEmail({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name?: string;
}): Promise<void> {
  const { error } = await authClient.signUp.email({
    email,
    password,
    // Better Auth requires a name; default to the email local-part when blank.
    name: name?.trim() || email.split("@")[0] || email,
  });
  if (error) throw new Error(error.message ?? "Sign-up failed");
}

/**
 * Start social sign-in (e.g. Google). Better Auth redirects the top-level
 * window to the provider and back to `callbackURL` on success. Only offered
 * when the provider is configured server-side (see `authProvidersFn`).
 */
export async function signInSocial(
  provider: string,
  callbackURL = "/",
): Promise<void> {
  const { error } = await authClient.signIn.social({ provider, callbackURL });
  if (error) throw new Error(error.message ?? "Sign-in failed");
}

/**
 * Sign out of this app's session, then redirect.
 *
 * The session is an HttpOnly `__Host-` cookie only the server can clear, and
 * `server.ts` enables `session.cookieCache`, so ONLY a completed sign-out
 * response actually signs the visitor out — a failed/timed-out call throws
 * rather than reporting a sign-out that did not happen. `<UserButton />` handles
 * that; a hand-rolled control must catch it and let the visitor retry.
 *
 * Sequencing lives in `scripts/sign-out-plan.mjs` so it can be unit-tested.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  await runSignOut({
    // No live-preview iframe / bearer token anymore — always the deployed
    // (cookie) path, where sign-out must be server-confirmed.
    livePreview: false,
    hasBearer: false,
    // Better Auth resolves with `{ error }` instead of rejecting, so surface a
    // failed response as a rejection for the sequence to act on.
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    clearToken: () => {},
    redirect: () => {
      window.location.href = redirectTo;
    },
  });
}
