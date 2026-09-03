import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  createTeamSchema,
  deleteTeamSceneSchema,
  joinTeamSchema,
  kickMemberSchema,
  renameTeamSchema,
  setMemberRoleSchema,
  shareToTeamSchema,
  teamIdSchema,
  type TeamMember,
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

export const listTeamMembersFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => teamIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<TeamMember[]> => {
    const { listMembers } = await import("./server.ts");
    return listMembers(context.userId, data.teamId);
  });

export const setMemberRoleFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => setMemberRoleSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { setMemberRole } = await import("./server.ts");
    return { ok: await setMemberRole(context.userId, data.teamId, data.userId, data.role) };
  });

export const kickMemberFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => kickMemberSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { kickMember } = await import("./server.ts");
    return { ok: await kickMember(context.userId, data.teamId, data.userId) };
  });

export const leaveTeamFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => teamIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { leaveTeam } = await import("./server.ts");
    return { ok: await leaveTeam(context.userId, data.teamId) };
  });

export const dissolveTeamFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => teamIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { dissolveTeam } = await import("./server.ts");
    return { ok: await dissolveTeam(context.userId, data.teamId) };
  });

export const renameTeamFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => renameTeamSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { renameTeam } = await import("./server.ts");
    return { ok: await renameTeam(context.userId, data.teamId, data.name) };
  });

export const deleteTeamSceneFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => deleteTeamSceneSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { deleteTeamScene } = await import("./server.ts");
    return { ok: await deleteTeamScene(context.userId, data.teamId, data.id) };
  });
