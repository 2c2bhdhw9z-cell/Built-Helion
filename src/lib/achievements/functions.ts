import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { GrantedAchievement } from "./types.ts";

/**
 * Return the signed-in account's granted achievements (Req 8.4).
 *
 * Uses `authMiddleware` so `context.userId` is the caller's verified id, then
 * reads that account's full granted set via `listAchievements`. The server-only
 * `./server.ts` is dynamically imported inside the handler to keep it out of the
 * client bundle.
 *
 * Signed-out handling lives in the client hook (task 6.9): this authed function
 * simply returns the account's set. A signed-out caller never reaches here — the
 * hook returns `[]` and never blocks the simulator (Req 8.5).
 */
export const listAchievementsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<GrantedAchievement[]> => {
    const { listAchievements } = await import("./server.ts");
    return listAchievements(context.userId);
  });
