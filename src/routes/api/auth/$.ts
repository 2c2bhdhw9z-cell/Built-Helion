import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/**
 * Mount the self-hosted Better Auth handler at same-origin `/api/auth/*`.
 *
 * The Better Auth client (`@/lib/auth/client`) and OAuth callbacks all POST/GET
 * to `/api/auth/*`; without this route those requests fell through to the SPA
 * 404 shell, so sign-up / sign-in / get-session / OAuth were entirely unserved.
 * This splat route forwards EVERY method to `auth.handler(request)`.
 *
 * `auth` is a server-only import (it pulls in `pg` + Better Auth internals). A
 * file-route `server.handlers.*` only runs server-side, so nothing here reaches
 * the client bundle.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      ANY: ({ request }) => auth.handler(request),
    },
  },
});
