import { getSql } from "@/lib/db";
import {
  DEFAULT_BILLING,
  TRIAL_DAYS,
  deriveBilling,
  type BillingState,
  type PlanId,
} from "./types.ts";

type SubRow = {
  plan: string;
  trial_ends_at: string | Date | null;
};

function asPlan(value: string | null | undefined): PlanId {
  if (value === "pro" || value === "enterprise" || value === "free") return value;
  return "free";
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

/**
 * Load (or create) the caller's subscription. First visit starts a 7-day Pro
 * trial so a new account can actually try the paid generators/export.
 */
export async function getOrCreateBilling(userId: string): Promise<BillingState> {
  const sql = await getSql();
  const existing = await sql<SubRow>`
    select plan, trial_ends_at from subscriptions where user_id = ${userId}
  `;
  if (existing[0]) {
    return deriveBilling(asPlan(existing[0].plan), existing[0].trial_ends_at);
  }
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await sql<SubRow>`
    insert into subscriptions (user_id, plan, trial_ends_at, updated_at)
    values (${userId}, 'free', ${trialEnds}, now())
    on conflict (user_id) do update set user_id = excluded.user_id
    returning plan, trial_ends_at
  `;
  const row = rows[0];
  if (!row) return { ...DEFAULT_BILLING };
  return deriveBilling(asPlan(row.plan), row.trial_ends_at);
}

export async function choosePlan(userId: string, plan: PlanId): Promise<BillingState> {
  const sql = await getSql();
  await getOrCreateBilling(userId);
  const rows = await sql<SubRow>`
    update subscriptions
    set plan = ${plan}, updated_at = now()
    where user_id = ${userId}
    returning plan, trial_ends_at
  `;
  const row = rows[0];
  if (!row) return getOrCreateBilling(userId);
  return deriveBilling(asPlan(row.plan), row.trial_ends_at);
}

export function trialEndIsoFromRow(row: { trial_ends_at: string | Date | null }): string | null {
  return toIso(row.trial_ends_at);
}
