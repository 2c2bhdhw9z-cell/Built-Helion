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

The particle simulator is **fully functional without authentication**, and running unauthenticated is the supported standalone mode — the core simulation has no auth dependency, so you do not need to configure anything to deploy and use it.

The app ships with a built-in federated sign-in that federates to a shared "Grok auth broker". Turning it into a working sign-in requires broker credentials (`GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`, and `GROK_AUTH_ISSUER`) that **this standalone template does not provide**. Note that:

- `VITE_AUTH_ENABLED` is only read as an off-switch (`=== "false"`); setting it to `true` does **not** by itself enable working sign-in.
- `BETTER_AUTH_SECRET` is genuinely used to sign sessions, but is **not** sufficient on its own to produce working federated sign-in.

Because of this, federated sign-in is **not available on a plain Vercel deploy** unless you wire up your own auth broker to supply those credentials. Until then, deploy the app without any auth variables and it runs unauthenticated as intended.

### Feedback admin (`/admin/feedback`)

The app includes a feedback system: anyone can submit feedback from the in-app dialog, and `/admin/feedback` lists every submission (including submitter emails) and lets you change each submission's status. Because that view exposes PII and offers write access, it is **protected server-side** and does not rely on hiding the UI.

Since the standalone deploy has no working sign-in, the primary mechanism is a shared admin token:

- Set **`FEEDBACK_ADMIN_TOKEN`** in your deploy environment (Vercel → Settings → Environment Variables) to any long random secret (e.g. `openssl rand -hex 32`).
- Open the admin view with that token in the URL: `https://your-app.vercel.app/admin/feedback?token=<FEEDBACK_ADMIN_TOKEN>`. The token is verified on the server (constant-time compare) before any row is read or updated.

If you have wired up real sign-in, you can instead set **`ADMIN_EMAILS`** to a comma-separated allowlist; a signed-in user whose verified email is on the list is authorized.

**Fail-closed by default:** on a real deploy (`DATABASE_URL` set) with neither `FEEDBACK_ADMIN_TOKEN` nor `ADMIN_EMAILS` configured, `/admin/feedback` denies access and returns no rows — so submissions are never world-readable by accident. Local development (no `DATABASE_URL`, embedded PGLite) leaves it open for convenience.
