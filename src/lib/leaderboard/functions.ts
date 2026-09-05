import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LeaderboardEntry } from "./types.ts";

/**
 * Optional query for the public leaderboard: a single optional numeric `limit`.
 * A missing / non-numeric value leaves `limit` undefined so the data layer
 * clamps to its configured maximum (Req 7.4). The `.catch(...)` keeps a
 * malformed input from throwing — the board is public and best-effort readable.
 */
const leaderboardQuerySchema = z
  .object({ limit: z.number().optional() })
  .catch({ limit: undefined });

/**
 * Public global leaderboard (Req 7.5).
 *
 * NO auth — signed-out viewers can read the ranked board, mirroring the public
 * `listLibraryFn`. The server-only `./server.ts` is dynamically imported inside
 * the handler so it never reaches the client bundle. An optional numeric
 * `limit` is validated with zod; the data layer clamps it into
 * `1..MAX_LEADERBOARD_ENTRIES`.
 */
export const listLeaderboardFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => leaderboardQuerySchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<LeaderboardEntry[]> => {
    const { listLeaderboard } = await import("./server.ts");
    return listLeaderboard(data.limit);
  });
