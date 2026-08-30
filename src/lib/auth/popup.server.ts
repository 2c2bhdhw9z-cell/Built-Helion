/**
 * Legacy live-preview sign-in popup endpoint — server-only.
 *
 * This app now uses REAL self-hosted Better Auth (email/password + optional
 * Google) with a normal full-page OAuth redirect — there is NO broker and no
 * partitioned-iframe popup flow anymore. The `/auth/popup` path is still wired
 * by the Vite `authPopupPlugin` in `vite.config.ts` (dev only), but nothing in
 * the app opens it: `client.ts`'s `signInSocial` calls Better Auth's built-in
 * `signIn.social`, which redirects the top-level window to `/api/auth/*`.
 *
 * Kept as an inert stub so the dev-only plugin has something to load and returns
 * a clear response if the path is ever hit directly.
 */

/**
 * Handle `GET /auth/popup`. Inert: real sign-in no longer uses a popup, so this
 * just reports that the endpoint is disabled.
 */
export async function handleAuthPopupRequest(_request: Request): Promise<Response> {
  return new Response(
    "Sign-in popup is disabled — this app uses same-origin Better Auth sign-in.",
    {
      status: 410,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
