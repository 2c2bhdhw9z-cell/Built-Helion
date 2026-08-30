/**
 * Pure, dependency-free auth configuration logic.
 *
 * Kept out of `server.ts` (which pulls in `pg` + the Better Auth instance +
 * `pglite-dialect`) so both the server AND unit tests can import it without
 * loading any server-only or bundler-only code. Zero imports so it loads under
 * plain `node --experimental-strip-types`. Mirrors the split already used by
 * `./providers` and `./email-password`.
 */

/** Read an env var, treating empty/whitespace as unset. */
export function readEnv(
  key: string,
  source: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = source[key]?.trim();
  return value ? value : undefined;
}

/**
 * Google OAuth is available ONLY when BOTH credentials are present (non-empty
 * after trim). One-or-none means Google is off and email/password carries the
 * app; the "Continue with Google" button is hidden.
 */
export function isGoogleConfigured(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    readEnv("GOOGLE_CLIENT_ID", source) && readEnv("GOOGLE_CLIENT_SECRET", source),
  );
}

/**
 * GitHub OAuth is available ONLY when BOTH credentials are present (non-empty
 * after trim). One-or-none means GitHub is off and the app carries on with its
 * other methods; the "Continue with GitHub" button is hidden. GitHub OAuth is
 * free — the owner registers an OAuth App at https://github.com/settings/developers.
 */
export function isGithubConfigured(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    readEnv("GITHUB_CLIENT_ID", source) && readEnv("GITHUB_CLIENT_SECRET", source),
  );
}

/**
 * Apple "Sign in with Apple" is available ONLY when the FULL credential set is
 * present (each non-empty after trim): the Services ID (`APPLE_CLIENT_ID`), the
 * `APPLE_TEAM_ID`, the `APPLE_KEY_ID`, and the `.p8` private key contents
 * (`APPLE_PRIVATE_KEY`). Unlike Google/GitHub, Apple has no static client
 * secret — the app generates a short-lived ES256 JWT from these four values
 * (see `apple-secret.server.ts`), so all four are required. Any one missing
 * leaves Apple OFF and the "Continue with Apple" button hidden. Apple requires a
 * paid Apple Developer account ($99/yr), so this stays dormant until the owner
 * sets these env vars — no code change is needed to turn it on.
 */
export function isAppleConfigured(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    readEnv("APPLE_CLIENT_ID", source) &&
      readEnv("APPLE_TEAM_ID", source) &&
      readEnv("APPLE_KEY_ID", source) &&
      readEnv("APPLE_PRIVATE_KEY", source),
  );
}

/** True when sign-in is force-disabled via `VITE_AUTH_ENABLED=false`. */
export function isAuthDisabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return readEnv("VITE_AUTH_ENABLED", source) === "false";
}

/**
 * True when REAL auth is available — i.e. sign-in is not force-disabled AND at
 * least one method is on (email/password, Google, GitHub, or Apple). No
 * broker/GROK_AUTH_* is involved. `verify.server.ts` (via `server.ts`) branches
 * on this to decide whether to resolve a real session vs. return the dev user.
 */
export function isAuthConfigured(
  source: Record<string, string | undefined>,
  emailPasswordOn: boolean,
): boolean {
  return (
    !isAuthDisabled(source) &&
    (emailPasswordOn ||
      isGoogleConfigured(source) ||
      isGithubConfigured(source) ||
      isAppleConfigured(source))
  );
}
