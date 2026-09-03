import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { userPreferencesSchema, type UserPreferences } from "./types.ts";

/**
 * TanStack Start server functions for per-user preferences.
 *
 * Both use `authMiddleware`, so they run ONLY for a signed-in caller and scope
 * every query to the verified `context.userId`. Signed-out clients must NOT
 * call these — they persist preferences in platform KV instead (see
 * src/routes/settings.tsx). The non-blocking rule: nothing here forces login;
 * /settings degrades to local storage when logged out and never errors.
 *
 * The handlers dynamically import the server-only DB layer (./server.ts) so
 * getSql() and its transitive server-only code never enter the client bundle.
 */

/** Load the signed-in user's stored preferences (default when none saved). */
export const getPreferencesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<UserPreferences> => {
    const { getPreferences } = await import("./server.ts");
    return getPreferences(context.userId);
  });

/** Persist the signed-in user's preferences and return the saved value. */
export const updatePreferencesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => userPreferencesSchema.parse(input))
  .handler(async ({ data, context }): Promise<UserPreferences> => {
    const { upsertPreferences } = await import("./server.ts");
    return upsertPreferences(context.userId, data);
  });
