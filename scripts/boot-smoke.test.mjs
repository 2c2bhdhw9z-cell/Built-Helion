import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

/**
 * Boot smoke test for the BUILT Nitro handler.
 *
 * This guards two production-down regressions that unit tests cannot catch
 * because they only surface once Vite/Nitro has chunked the app:
 *
 *   1. The circular-ESM-chunk crash (`TypeError: createSsrRpc is not a
 *      function`) that 500'd every route when a top-level createServerFn call
 *      was co-located into the route-tree SSR chunk (FEAT-001). If it recurs,
 *      GET / stops returning 200 HTML and this test fails.
 *   2. The Better Auth handler being unmounted, so /api/auth/* falls through to
 *      the router's 404 SPA shell instead of the auth handler (FEAT-002).
 *
 * It drives the same built handler the reproduction probe uses:
 *   const mod = await import(indexMjs);
 *   const res = await mod.default.fetch(new Request(url), {});
 *
 * The test is deterministic and DB-independent: it points DATABASE_URL at an
 * UNREACHABLE dummy so a routed /api/auth/* still produces a Better-Auth
 * response (not the router 404). It SKIPS gracefully when the tree is not built
 * so it never becomes a spurious failure in the scripts suite.
 */

const here = dirname(fileURLToPath(import.meta.url));
const indexMjs = join(
  here,
  "..",
  ".vercel",
  "output",
  "functions",
  "__server.func",
  "index.mjs",
);

// Prod-like env, set BEFORE importing the handler so module-eval sees it.
// The DB is intentionally unreachable: a routed /api/auth/* must not depend on
// a live Postgres to prove it is handled by Better Auth rather than the router.
process.env.DATABASE_URL =
  "postgresql://u:p@127.0.0.1:55999/neondb?sslmode=require&channel_binding=require";
process.env.BETTER_AUTH_URL = "https://built-helion.vercel.app";
process.env.BETTER_AUTH_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const built = existsSync(indexMjs);

test(
  "built handler renders GET / as 200 HTML and routes /api/auth/* to Better Auth",
  { skip: built ? false : "no .vercel/output build present; run `npx vite build` first" },
  async () => {
    const mod = await import(indexMjs);
    const handler = mod.default;
    assert.equal(
      typeof handler?.fetch,
      "function",
      "built handler must export a default with a fetch() method",
    );

    // (a) A bare document request must SSR to a real HTML shell, not 500.
    // This is the exact production symptom the chunk-cycle crash produced.
    const homeRes = await handler.fetch(
      new Request("https://built-helion.vercel.app/", {
        headers: { accept: "text/html" },
      }),
      {},
    );
    const homeBody = await homeRes.text();
    assert.equal(
      homeRes.status,
      200,
      `GET / expected 200, got ${homeRes.status}: ${homeBody.slice(0, 200)}`,
    );
    assert.ok(
      homeBody.startsWith("<!DOCTYPE html>"),
      `GET / body should start with <!DOCTYPE html>, got: ${homeBody.slice(0, 80)}`,
    );

    // (b) /api/auth/* must be ROUTED to Better Auth, not the router 404 SPA
    // shell. Better Auth's get-session returns 200 with body 'null' for an
    // anonymous caller (no DB round-trip needed for an empty session), so a
    // 404 or an HTML shell here means the auth route is not mounted.
    const sessionRes = await handler.fetch(
      new Request(
        "https://built-helion.vercel.app/api/auth/get-session",
        { headers: { accept: "application/json" } },
      ),
      {},
    );
    const sessionBody = await sessionRes.text();
    assert.notEqual(
      sessionRes.status,
      404,
      `GET /api/auth/get-session should be routed to Better Auth, got 404: ${sessionBody.slice(0, 200)}`,
    );
    assert.ok(
      !sessionBody.startsWith("<!DOCTYPE html>"),
      `GET /api/auth/get-session should not be the router HTML shell, got: ${sessionBody.slice(0, 80)}`,
    );
    assert.equal(
      sessionBody,
      "null",
      `GET /api/auth/get-session (anonymous) should return Better Auth's 'null' body, got: ${sessionBody.slice(0, 120)}`,
    );
  },
);
