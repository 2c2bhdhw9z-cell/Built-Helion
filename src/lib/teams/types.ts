import { z } from "zod";
import { creationConfigSchema } from "@/lib/creations/types";

export type TeamRole = "owner" | "edit" | "view";

export type TeamRow = {
  id: string;
  name: string;
  joinCode: string;
  ownerId: string;
  role: TeamRole;
  createdAt: string | Date;
};

export type TeamMember = {
  userId: string;
  name: string;
  role: TeamRole;
  joinedAt: string | Date;
};

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const joinTeamSchema = z.object({
  code: z.string().trim().min(4).max(12),
});

export const teamIdSchema = z.object({
  teamId: z.string().min(1),
});

export const shareToTeamSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  config: creationConfigSchema,
});

export const renameTeamSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

export const setMemberRoleSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["edit", "view"]),
});

export const kickMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

export const deleteTeamSceneSchema = z.object({
  teamId: z.string().min(1),
  id: z.string().min(1),
});
