# Helion Particle Lab

A high-performance WebGPU particle sandbox featuring n-body gravity, fluid dynamics, and organic flow fields. GPU-backed particles run in the browser (WebGL2 point sprites with a Canvas2D fallback), CPU SoA physics, spatial hash, and a two-arm rainbow galaxy that holds its shape while it rotates.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL (the dev server listens on `http://0.0.0.0:3000`, so on the same machine use `http://localhost:3000`). Default generator is **Galaxy**. No environment variables are required: the app uses an embedded in-memory database (PGLite) when none is configured.

## Controls

- **Count / Add / Clear** — inject or wipe particles
- **Size** — particle diameter in pixels
- **Galaxy, Ring, Burst, Pour, Fall, Flock, Cloth, N-body** — generators
- **Attract / Repel / Vortex / Paint / Freeze** — pointer tools
- Visuals tab — palettes including **rainbow**

Built with Vite, React, and WebGL2 (Canvas2D fallback).

## Deploy (works from a phone)

You can deploy this app entirely from a phone browser using the Vercel and Neon web dashboards. The Nitro `vercel` preset is already configured in `vite.config.ts`, so no extra build settings are needed.

1. **Create a database (recommended).** In the [Neon](https://neon.tech) web dashboard, create a free Postgres project and copy its connection string. Without a database the app still runs, but it uses ephemeral in-memory storage that does not persist across serverless invocations (see the note below).
2. **Import the repo into Vercel.** In the [Vercel](https://vercel.com) web dashboard, add a new project and connect the GitHub repository `2c2bhdhw9z-cell/Built-Helion`. Vercel detects the Vite/Nitro setup automatically; leave the build and output settings at their defaults.
3. **Add the environment variable** in the Vercel project settings (Settings → Environment Variables):
   - `DATABASE_URL` — required for data to persist. Paste the Neon connection string from step 1.

   See `.env.example` for a full description. Do not commit real secret values.
4. **Deploy.** Trigger the deployment from the Vercel dashboard and open the generated URL on your phone.

### A note on storage without a database

With no `DATABASE_URL` set, the app still boots and runs using an embedded PGLite (Postgres-in-WASM) database. That storage is in-memory only and is **not** shared across serverless invocations, so any saved data is ephemeral on a hosted deploy. Set `DATABASE_URL` (for example, a free Neon database) whenever you need data to persist.

### Authentication

Auth is **optional and non-blocking**. The particle simulator and the feedback system are **fully functional without signing in** — nothing forces a visitor to authenticate, and there is no forced redirect anywhere. Sign-in exists only for visitors who want an account.

This app uses **real, self-hosted [Better Auth](https://www.better-auth.com/)** running at same-origin `/api/auth/*` against **your own database** — there is no external broker and no credentials you cannot obtain:

- **Email + password** — works with **zero extra configuration locally** (persisted to the embedded PGLite database). It is enabled by default.
- **Google OAuth** — **optional**. It activates only when you supply `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. When those are absent, the "Continue with Google" button is simply hidden and email/password still works.

Sign in / sign up from the **Sign in** button in the HUD (or visit `/login`). Signed-in visitors see their account in the HUD with a **Sign out** control.

#### Required environment variables (for a persistent hosted deploy)

Set these in Vercel → Settings → Environment Variables:

- **`BETTER_AUTH_SECRET`** — a random secret used to sign sessions. Generate one with `openssl rand -hex 32`.
- **`BETTER_AUTH_URL`** — the public URL of your deployment, e.g. `https://built-helion.vercel.app`. Better Auth uses this as its base URL and trusted origin.
- **`DATABASE_URL`** — a Postgres connection string (e.g. a free [Neon](https://neon.tech/) database). Required for accounts and sessions to **persist** across serverless invocations. Without it the app falls back to in-memory PGLite and any accounts are ephemeral.

Email/password sign-in works with only those three variables — no OAuth app, no broker.

#### Optional: Google sign-in

To offer "Continue with Google", create an OAuth 2.0 Client ID in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and set:

- **`GOOGLE_CLIENT_ID`**
- **`GOOGLE_CLIENT_SECRET`**

When registering the OAuth client, add this **Authorized redirect URI** (Better Auth's Google callback path):

```
https://built-helion.vercel.app/api/auth/callback/google
```

(replace the host with your own `BETTER_AUTH_URL`). Supplying only one of the two variables leaves Google **off**; its absence never affects email/password or the rest of the app.

Adding more social providers (e.g. GitHub, Apple) later is a small change: add an entry to `SOCIAL_PROVIDERS` in `src/lib/auth/providers.ts` and a matching guarded `socialProviders` block in `src/lib/auth/server.ts`.

> To turn sign-in **off** entirely, set `VITE_AUTH_ENABLED=false` (the app then uses a local dev user and hides sign-in UI).

### Feedback admin (`/admin/feedback`)

The app includes a feedback system: anyone can submit feedback from the in-app dialog, and `/admin/feedback` lists every submission (including submitter emails) and lets you change each submission's status. Because that view exposes PII and offers write access, it is **protected server-side** and does not rely on hiding the UI.

There are two supported mechanisms — a shared admin token, or an email allowlist for signed-in users:

- **Admin token:** set **`FEEDBACK_ADMIN_TOKEN`** in your deploy environment (Vercel → Settings → Environment Variables) to any long random secret (e.g. `openssl rand -hex 32`), then open the admin view with that token in the URL: `https://your-app.vercel.app/admin/feedback?token=<FEEDBACK_ADMIN_TOKEN>`. The token is verified on the server (constant-time compare) before any row is read or updated.
- **Email allowlist:** with real sign-in configured (see [Authentication](#authentication)), set **`ADMIN_EMAILS`** to a comma-separated allowlist; a signed-in user whose verified email is on the list is authorized.

**Fail-closed by default:** on a real deploy (`DATABASE_URL` set) with neither `FEEDBACK_ADMIN_TOKEN` nor `ADMIN_EMAILS` configured, `/admin/feedback` denies access and returns no rows — so submissions are never world-readable by accident. Local development (no `DATABASE_URL`, embedded PGLite) leaves it open for convenience.
