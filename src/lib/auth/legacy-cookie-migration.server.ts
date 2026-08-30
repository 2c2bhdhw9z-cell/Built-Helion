// ===== LEGACY COOKIE MIGRATION (grok -> helion) =====================================
// SAFE TO DELETE this file (plus the pure helpers in `./cookie-migration.ts`, the
// `./cookie-migration.test.ts` test + its package.json `test` entry, and the
// `legacyCookieMigration()` entry in the plugins array of `./server.ts`) once existing
// sessions have cycled onto the `__Host-helion-auth.*` cookies. Nothing else depends
// on it.
//
// WHY THIS EXISTS
// A prior build shipped the session cookies as `__Host-grok-auth.*`. Debranding renames
// them to `__Host-helion-auth.*`. Better Auth reads a cookie by a single configured name
// (it cannot "read the old name, write the new name"), so a plain rename would sign
// every already-signed-in visitor out on the next deploy (their browser still carries
// only the legacy cookie). This self-contained plugin bridges ONE request cycle:
//   - before: if the NEW `__Host-helion-auth.session_token` is absent but the OLD
//     `__Host-grok-auth.session_token` is present, copy the legacy value under the new
//     name in the inbound Cookie header (same for `session_data`) so Better Auth
//     resolves the session normally. (`migrateLegacyCookieHeader` in `./cookie-migration`.)
//   - after: expire the legacy `__Host-grok-auth.*` cookies (Max-Age=0) so the browser
//     drops them. `tanstackStartCookies` already writes the new-named cookie once the
//     session resolves, so from the next request on the browser carries only
//     `__Host-helion-auth.*` and this shim is a no-op.
//
// `__Host-` constraints are respected on the expiry Set-Cookie: Secure + Path=/ + no
// Domain. `sameSite` stays `lax`. `useSecureCookies:false` is left untouched.

import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import {
  expireLegacyCookie,
  LEGACY_COOKIE_NAMES,
  migrateLegacyCookieHeader,
} from "./cookie-migration";

/**
 * Self-contained Better Auth plugin implementing the read-old/write-new bridge.
 * `before` rewrites the inbound Cookie header; `after` expires the legacy cookies so
 * the browser stops sending them once the modern cookie is established.
 */
export function legacyCookieMigration(): BetterAuthPlugin {
  return {
    id: "legacy-cookie-migration",
    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const inbound = ctx.request?.headers ?? ctx.headers;
            if (!inbound) return;
            const result = migrateLegacyCookieHeader(inbound.get("cookie"));
            if (!result.changed) return;
            const headers = new Headers(inbound);
            headers.set("cookie", result.cookieHeader);
            return { context: { headers } };
          }),
        },
      ],
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const inbound = ctx.request?.headers ?? ctx.headers;
            // Only expire legacy cookies when the browser actually sent one; a request
            // carrying none needs no Set-Cookie churn.
            const cookieHeader = inbound?.get("cookie") ?? "";
            if (!LEGACY_COOKIE_NAMES.some((n) => cookieHeader.includes(`${n}=`))) {
              return;
            }
            const responseHeaders = ctx.context.responseHeaders;
            if (!responseHeaders) return;
            for (const name of LEGACY_COOKIE_NAMES) {
              if (!cookieHeader.includes(`${name}=`)) continue;
              responseHeaders.append("set-cookie", expireLegacyCookie(name));
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
// ===== END LEGACY COOKIE MIGRATION ==================================================
