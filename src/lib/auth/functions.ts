import { createServerFn } from "@tanstack/react-start";
import { SOCIAL_PROVIDERS, type SocialProvider } from "./providers";

/**
 * TanStack Start server functions for auth surface metadata.
 *
 * The client cannot see server-only env vars (GOOGLE_CLIENT_ID/SECRET), so it
 * asks the server which social providers are actually configured. This keeps
 * the "Continue with Google" button hidden when the owner has not supplied
 * credentials, without shipping the server-only Better Auth instance to the
 * browser (the handler dynamically imports the server-only module).
 */

/** A social provider the client may render a button for. */
export type EnabledProvider = SocialProvider;

/**
 * Return the auth methods available in this deployment: whether email/password
 * is on, and which social providers are configured. Public + unauthed by design
 * (it exposes only booleans/labels, never secrets).
 */
export const authProvidersFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    emailAndPassword: boolean;
    social: EnabledProvider[];
  }> => {
    const { emailAndPasswordEnabled } = await import("./email-password.ts");
    const { googleConfigured } = await import("./server.ts");
    const enabledIds = new Set<string>();
    if (googleConfigured) enabledIds.add("google");
    const social = SOCIAL_PROVIDERS.filter((p) => enabledIds.has(p.id));
    return { emailAndPassword: emailAndPasswordEnabled, social };
  },
);
