import { z } from "zod";
import { creationConfigSchema } from "@/lib/creations/types";
import type { PlanId } from "@/lib/billing/types";

export type TeamRole = "owner" | "edit" | "view";

/**
 * Team/org plan rules (Item 24). Shared team workspaces are a paid feature:
 * only an ENTITLED owner (Pro / Enterprise / active trial) can create a team,
 * and the number of seats a team may fill is bounded by the OWNER's plan.
 *
 *   - free / unentitled → cannot create a team at all (0 seats).
 *   - pro (or an active trial) → a small studio: up to PRO_SEAT_LIMIT seats.
 *   - enterprise → a large org: up to ENTERPRISE_SEAT_LIMIT seats.
 *
 * All of these are re-derived from the owner's server-side billing; the client
 * `entitled` flag is never trusted for the create/join writes. The helpers here
 * are pure so the seat math is unit-testable in isolation.
 */
export const PRO_SEAT_LIMIT = 5;
export const ENTERPRISE_SEAT_LIMIT = 50;

/**
 * Max seats a team may fill, given the OWNER's plan and entitlement. An
 * unentitled owner gets 0 (cannot own a team). An entitled non-enterprise plan
 * (Pro, or a free plan on an active trial) gets the small studio limit;
 * enterprise gets the org limit.
 */
export function seatLimit(plan: PlanId, entitled: boolean): number {
  if (!entitled) return 0;
  return plan === "enterprise" ? ENTERPRISE_SEAT_LIMIT : PRO_SEAT_LIMIT;
}

/** Whether an entitled owner on `plan` may CREATE a team at all. */
export function canCreateTeam(plan: PlanId, entitled: boolean): boolean {
  return seatLimit(plan, entitled) > 0;
}

/**
 * Whether a team with `currentSeats` filled may admit ONE more member, given
 * the owner's plan/entitlement. Pure: the server supplies the live seat count
 * and the owner's billing. Returns false once the team is at its seat limit so
 * a join is rejected rather than silently over-filling the workspace.
 */
export function canAddSeat(
  currentSeats: number,
  ownerPlan: PlanId,
  ownerEntitled: boolean,
): boolean {
  return currentSeats < seatLimit(ownerPlan, ownerEntitled);
}

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

/**
 * Outcome of a create-team attempt (Item 24). `"created"` made the team;
 * `"plan"` means the owner is not entitled to own a team (offer upgrade).
 */
export type CreateTeamResult =
  | { status: "created"; team: TeamRow }
  | { status: "plan" };

/**
 * Outcome of a join-team attempt (Item 24). `"joined"` added (or re-confirmed)
 * membership; `"notfound"` is a bad code; `"full"` means the team is at its
 * owner-plan seat limit, with `limit` echoing the ceiling for the UI message.
 */
export type JoinTeamResult =
  | { status: "joined"; team: TeamRow }
  | { status: "notfound" }
  | { status: "full"; limit: number };

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
