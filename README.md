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
3. **Add environment variables** in the Vercel project settings (Settings → Environment Variables). Paste the following values:
   - `DATABASE_URL` — required for data to persist. Paste the Neon connection string from step 1.
   - `BETTER_AUTH_SECRET` — only if you enable authentication. Generate a value with `openssl rand -hex 32` (or any 64-character hex string from a trusted generator) and paste it.
   - `VITE_AUTH_ENABLED` — set to `true` only if you want real authentication turned on.
   - `BETTER_AUTH_URL` — when auth is enabled, set this to your deployed URL, e.g. `https://your-app.vercel.app`.

   See `.env.example` for a full description of each variable. Do not commit real secret values.
4. **Deploy.** Trigger the deployment from the Vercel dashboard and open the generated URL on your phone.

### A note on storage without a database

With no `DATABASE_URL` set, the app still boots and runs using an embedded PGLite (Postgres-in-WASM) database. That storage is in-memory only and is **not** shared across serverless invocations, so any saved data is ephemeral on a hosted deploy. Set `DATABASE_URL` (for example, a free Neon database) whenever you need data to persist.
