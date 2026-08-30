/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * This app runs its OWN Better Auth at same-origin `/api/auth/*`, so the session
 * cookie stays on this app's own origin. Sign-in is REAL and self-hosted — there
 * is no external broker and no credentials the owner cannot obtain:
 *
 *   - **Email + password** — persisted to this app's own database (embedded
 *     PGLite locally, Neon in prod). Enabled via `./email-password` and works
 *     with zero extra config locally.
 *   - **Google OAuth** — a NATIVE Better Auth social provider that activates
 *     ONLY when the owner supplies `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
 *     (registered in Google Cloud Console). Its absence never breaks
 *     email/password or the app.
 *
 * Auth is OPTIONAL and NON-BLOCKING: the sim and feedback stay fully usable
 * while signed out. `requireUserId` (see `verify.server.ts`) still throws for
 * genuinely per-user server functions, but the sim/feedback never call it.
 *
 * Structured so more social providers (GitHub, Apple) are a one-line add: append
 * to `SOCIAL_PROVIDERS` in `./providers` and add a matching guarded block in
 * `socialProviders` below.
 *
 * NEVER import this from client code — it pulls in `pg` + server-only Better
 * Auth internals. The client uses `@/lib/auth/client`; components read the user
 * via `@/lib/auth/use-current-user`; server functions get a verified id via
 * `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "@/lib/db";
import { isAuthConfigured, isGoogleConfigured } from "./config";
import { emailAndPasswordEnabled } from "./email-password";
import { GATE_PROVIDER_ID, gateIdentitySessions } from "./gate-session.server";
import { pgliteDialect } from "./pglite-dialect";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Dev secret must outlive module reloads: PGLite (and its session rows) is
 * stored on `globalThis`, so an HMR re-eval of this file must NOT mint a new
 * signing secret or every existing session becomes invalid mid-dev. Process
 * restart clears both the secret and PGLite together. In prod the owner sets
 * `BETTER_AUTH_SECRET`, so this generated fallback is dev-only.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __grokAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__grokAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__grokAuthPreviewSecret__;
}

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// ── Google OAuth (optional) ──────────────────────────────────────────────────
// Native Better Auth social provider. Active ONLY when BOTH credentials are
// present; otherwise the app runs on email/password alone and the "Continue
// with Google" button is hidden (see `authProvidersFn` in ./functions).
const GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");
/** True when both Google OAuth credentials are supplied (pure detection). */
export const googleConfigured = isGoogleConfigured();

/**
 * True when REAL auth is available — sign-in not force-disabled AND at least one
 * method on (email/password, or Google). No broker/GROK_AUTH_* involved.
 * `verify.server.ts` branches on this to decide real session vs. dev user.
 */
export const authConfigured = isAuthConfigured(process.env, emailAndPasswordEnabled);

// ── Base URL / trusted origins ───────────────────────────────────────────────
// This app's own Better Auth origin. In prod the owner sets BETTER_AUTH_URL
// (e.g. https://built-helion.vercel.app). Locally we default to the dev origin —
// `npm run dev` serves http://localhost:3000 (see package.json), so trust the
// :3000 loopback variants or credentialed POSTs fail with "Invalid origin".
const explicitBaseURL = env("BETTER_AUTH_URL");
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://[::1]:3000",
];
const baseURL = explicitBaseURL ?? "http://localhost:3000";

// Origins Better Auth accepts on credentialed POSTs (sign-up/sign-in, etc.).
// Missing entries here surface as FORBIDDEN "Invalid origin".
const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : [...LOCAL_DEV_ORIGINS];

const databaseUrl = env("DATABASE_URL");

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (local dev) via a Kysely dialect — so Better Auth persists to
// the SAME DB as app data, including email/password users. Both use the Better
// Auth schema from `migrations/auth/0001_auth.sql`, copied into `migrations/`
// (migrations/0001_auth.sql) when the app turns sign-in on.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name. */
export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

// Google social provider, added only when both credentials are present. Absence
// leaves `socialProviders` empty so email/password still works.
const socialProviders = googleConfigured
  ? {
      google: {
        clientId: GOOGLE_CLIENT_ID as string,
        clientSecret: GOOGLE_CLIENT_SECRET as string,
      },
    }
  : {};

export const auth = betterAuth({
  baseURL,
  // Prod: owner sets BETTER_AUTH_SECRET. Dev: process-stable secret on globalThis
  // so HMR doesn't invalidate PGLite-backed sessions (see previewAuthSecret).
  secret: env("BETTER_AUTH_SECRET") ?? previewAuthSecret(),
  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // Covers the prod origin plus the local :3000 loopback variants dev uses.
  trustedOrigins,

  // Local email/password — toggled via `./email-password`. This is the primary,
  // zero-config method: works locally with no env vars.
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),

  // Native social providers (Google only for now, when configured). Structured
  // so GitHub/Apple can be added with one more guarded block.
  socialProviders,

  // Encrypt OAuth tokens at rest and let a returning social identity attach to
  // an existing local (email/password) user with the same email, so signing in
  // with Google after signing up by email does not error with
  // `account_not_linked`.
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", GATE_PROVIDER_ID],
    },
  },

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — shrinks the "loading"
  // window and reduces auth flicker.
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute, so a sibling app cannot "toss" a session
  // cookie onto this app. `__Host-` requires Secure + Path=/ + no Domain; Better
  // Auth otherwise uses `__Secure-` (which permits Domain), so we drop its auto
  // prefix (`useSecureCookies: false`) and set Secure + the names ourselves.
  // (Browsers allow Secure cookies on `http://localhost`, so local dev works.)
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },

  plugins: [
    // Dormant unless GROK_PROJECT_ID is set (gated inside — no-op otherwise).
    gateIdentitySessions(),

    // Accept `Authorization: Bearer <session-token>` as an alternative to the
    // cookie. Harmless for cookie auth (the hook only fires when an
    // Authorization header is present); kept for parity.
    bearer(),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

// Re-exported for convenience; the list lives in the dependency-free
// `providers.ts` so the client can import it too.
export { SOCIAL_PROVIDERS } from "./providers";
