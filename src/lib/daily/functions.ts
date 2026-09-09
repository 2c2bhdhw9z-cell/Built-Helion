import { createServerFn } from "@tanstack/react-start";
import { dailyBoardSchema, type DailyBoardEntry, type DailyChallenge } from "./types.ts";

/**
 * TanStack Start server functions for the daily challenge (Item 7).
 *
 * Both are PUBLIC + unauthed by design — viewing today's seed and its board
 * requires no login (the hard no-forced-login rule). Remixing the seed is a
 * separate authenticated write handled by the existing `forkCreationFn`. Each
 * handler dynamically imports the server-only ./server.ts so getSql() and its
 * transitive server code never enter the client bundle.
 */

/**
 * Return today's challenge (the deterministic seed + its loadable config +
 * the seed creation id entries fork from). Lazily materializes today's row the
 * first time it is requested, so no cron is needed. Public + unauthed.
 */
export const getDailyChallengeFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<DailyChallenge> => {
    const { getOrCreateChallenge } = await import("./server.ts");
    return getOrCreateChallenge();
  },
);

/**
 * Return the ranked board for a day's challenge (default: today): the public
 * creations forked from that day's seed, ordered by likes. Private children are
 * excluded and the projection is PII-free (display name only, never email).
 * Public + unauthed.
 */
export const listDailyChallengeBoardFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => dailyBoardSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<DailyBoardEntry[]> => {
    const { listChallengeBoard } = await import("./server.ts");
    return listChallengeBoard(data.day ?? new Date());
  });
