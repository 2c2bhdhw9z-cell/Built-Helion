import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  createTeamSchema,
  joinTeamSchema,
  shareToTeamSchema,
  teamIdSchema,
  type TeamRow,
} from "./types";
import type { LibraryItem } from "@/lib/creations/types";

export const createTeamFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => createTeamSchema.parse(input))
  .handler(async ({ data, context }): Promise<TeamRow> => {
    const { createTeam } = await import("./server.ts");
    return createTeam(context.userId, data.name);
  });

export const joinTeamFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => joinTeamSchema.parse(input))
  .handler(async ({ data, context }): Promise<TeamRow | null> => {
    const { joinTeam } = await import("./server.ts");
    return joinTeam(context.userId, data.code);
  });

export const listMyTeamsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TeamRow[]> => {
    const { listMyTeams } = await import("./server.ts");
    return listMyTeams(context.userId);
  });

export const listTeamLibraryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => teamIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<LibraryItem[]> => {
    const { listTeamLibrary } = await import("./server.ts");
    return listTeamLibrary(context.userId, data.teamId);
  });

export const shareToTeamFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => shareToTeamSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { shareToTeam } = await import("./server.ts");
    const ok = await shareToTeam(context.userId, data.teamId, data.name, data.config);
    return { ok };
  });
