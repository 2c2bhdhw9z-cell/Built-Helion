import { createServerFn } from "@tanstack/react-start";
import { dbSource } from "@/lib/db";

/**
 * Client-visible backend info (Req 1.4).
 *
 * `getBackendInfoFn` is a NO-AUTH, client-callable server function that reports
 * whether the active database backend is ephemeral. `dbSource` is a plain
 * module-level constant in `@/lib/db` (`"neon"` when `DATABASE_URL` is set,
 * `"pglite"` otherwise), so reading it never opens a connection, never runs a
 * query, and never blocks — the engine can call this at boot without risk.
 *
 * The Embedded_Database (PGLite, in-memory) resets on process restart, so when
 * it is active the client surfaces a "storage is not persistent" indication.
 * The Hosted_Database (Neon) is durable, so `ephemeral` is false there.
 */
export const getBackendInfoFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ephemeral: boolean }> => {
    return { ephemeral: dbSource === "pglite" };
  },
);
