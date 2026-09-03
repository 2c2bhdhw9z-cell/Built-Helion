import { z } from "zod";

export type PlanId = "free" | "pro" | "enterprise";

export const PLAN_IDS = ["free", "pro", "enterprise"] as const;

export const TRIAL_DAYS = 7;

export type BillingState = {
  plan: PlanId;
  trialEndsAt: string | null;
  entitled: boolean;
  trialActive: boolean;
};

export const DEFAULT_BILLING: BillingState = {
  plan: "free",
  trialEndsAt: null,
  entitled: false,
  trialActive: false,
};

export function isEntitled(
  plan: PlanId,
  trialEndsAt: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  if (plan === "pro" || plan === "enterprise") return true;
  if (!trialEndsAt) return false;
  const t = typeof trialEndsAt === "string" ? Date.parse(trialEndsAt) : trialEndsAt.getTime();
  return Number.isFinite(t) && t > now;
}

export function isTrialActive(
  trialEndsAt: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  if (!trialEndsAt) return false;
  const t = typeof trialEndsAt === "string" ? Date.parse(trialEndsAt) : trialEndsAt.getTime();
  return Number.isFinite(t) && t > now;
}

export function deriveBilling(
  plan: PlanId,
  trialEndsAt: string | Date | null | undefined,
  now = Date.now(),
): BillingState {
  const iso =
    trialEndsAt == null
      ? null
      : typeof trialEndsAt === "string"
        ? trialEndsAt
        : trialEndsAt.toISOString();
  return {
    plan,
    trialEndsAt: iso,
    entitled: isEntitled(plan, trialEndsAt, now),
    trialActive: isTrialActive(trialEndsAt, now) && plan === "free",
  };
}

export const choosePlanSchema = z.object({
  plan: z.enum(PLAN_IDS),
});

export const PLANS: {
  id: PlanId;
  label: string;
  price: string;
  blurb: string;
  perks: string[];
}[] = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    blurb: "The full lab, with a small mark on exports.",
    perks: ["All core generators", "PNG / JPG / GIF / video", "Save & share", "Watermarked stills"],
  },
  {
    id: "pro",
    label: "Pro",
    price: "$5/mo",
    blurb: "The looks that sell a clip.",
    perks: ["6 Pro generators", "No watermark", "4K stills", "Community publishing"],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "$20/mo",
    blurb: "Headroom for studios.",
    perks: ["Everything in Pro", "4K stills, no watermark", "Team & SSO later"],
  },
];
