/**
 * The social sign-in providers this app offers (self-hosted Better Auth).
 *
 * Source of truth for BOTH the server (`server.ts`, one Better Auth
 * `socialProviders` entry per id) and the client (`client.ts` / sign-in
 * buttons). Kept in its own dependency-free module so the client can import it
 * without pulling the server-only Better Auth instance (and `pg`) into the
 * browser bundle.
 *
 * Each provider is a REAL first-party OAuth app the owner registers with the
 * upstream (e.g. Google Cloud Console) and wires up via env vars — there is no
 * shared broker. A provider is only offered when its credentials are present
 * (see `server.ts` `socialProviders` / the `authProvidersFn` server function),
 * so absent credentials simply hide the button.
 *
 * To add an upstream later (e.g. GitHub) it is a one-line change here:
 *   { id: "github", label: "GitHub" }
 * then add the matching `socialProviders.github` block (guarded on its env
 * vars) in `server.ts`. `id` is Better Auth's social provider id and the OAuth
 * callback path segment (`/api/auth/callback/<id>`).
 */
export type SocialProvider = {
  /** Better Auth social provider id; also the callback path segment. */
  id: string;
  /** Human label for the sign-in button. */
  label: string;
};

export const SOCIAL_PROVIDERS: readonly SocialProvider[] = [
  { id: "google", label: "Google" },
];
