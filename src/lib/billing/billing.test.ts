import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  DEFAULT_BILLING,
  TRIAL_DAYS,
  choosePlanSchema,
  deriveBilling,
  isEntitled,
  isTrialActive,
  type BillingState,
  type PlanId,
} from "./types.ts";

register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type BillingServer = {
  getOrCreateBilling: (userId: string) => Promise<BillingState>;
  choosePlan: (userId: string, plan: PlanId) => Promise<BillingState>;
};

describe("billing entitlement math", () => {
  it("pro and enterprise are always entitled", () => {
    assert.equal(isEntitled("pro", null), true);
    assert.equal(isEntitled("enterprise", null), true);
    assert.equal(isEntitled("free", null), false);
  });

  it("a future trial_ends_at entitles a free plan", () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isEntitled("free", future), true);
    assert.equal(isTrialActive(future), true);
  });

  it("an expired trial does not entitle", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    assert.equal(isEntitled("free", past), false);
    assert.equal(isTrialActive(past), false);
  });

  it("deriveBilling marks trialActive only on free+future", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const free = deriveBilling("free", future);
    assert.equal(free.entitled, true);
    assert.equal(free.trialActive, true);
    const pro = deriveBilling("pro", future);
    assert.equal(pro.entitled, true);
    assert.equal(pro.trialActive, false);
  });

  it("choosePlanSchema accepts the three plan ids", () => {
    assert.equal(choosePlanSchema.parse({ plan: "pro" }).plan, "pro");
    assert.equal(choosePlanSchema.parse({ plan: "enterprise" }).plan, "enterprise");
    assert.equal(choosePlanSchema.parse({ plan: "free" }).plan, "free");
    assert.equal(choosePlanSchema.safeParse({ plan: "gold" }).success, false);
  });

  it("DEFAULT_BILLING is unentitled free", () => {
    assert.deepEqual(DEFAULT_BILLING, {
      plan: "free",
      trialEndsAt: null,
      entitled: false,
      trialActive: false,
    });
    assert.equal(TRIAL_DAYS, 7);
  });
});

describe("billing DB round trip (real PGLite, migration 0005)", () => {
  let server: BillingServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as BillingServer;
  });

  it("first visit auto-starts a 7-day trial", async () => {
    const billing = await server.getOrCreateBilling("trial-user");
    assert.equal(billing.plan, "free");
    assert.equal(billing.entitled, true);
    assert.equal(billing.trialActive, true);
    assert.ok(billing.trialEndsAt);
    const ends = Date.parse(billing.trialEndsAt!);
    const delta = ends - Date.now();
    assert.ok(delta > 6 * 24 * 60 * 60 * 1000, "trial should last about 7 days");
    assert.ok(delta < 8 * 24 * 60 * 60 * 1000);
  });

  it("getOrCreateBilling is idempotent and does not reset the trial", async () => {
    const first = await server.getOrCreateBilling("idem-user");
    const second = await server.getOrCreateBilling("idem-user");
    assert.equal(first.trialEndsAt, second.trialEndsAt);
  });

  it("choosePlan upgrades to pro and stays entitled after trial would end", async () => {
    await server.getOrCreateBilling("plan-user");
    const pro = await server.choosePlan("plan-user", "pro");
    assert.equal(pro.plan, "pro");
    assert.equal(pro.entitled, true);
    const enterprise = await server.choosePlan("plan-user", "enterprise");
    assert.equal(enterprise.plan, "enterprise");
    const free = await server.choosePlan("plan-user", "free");
    assert.equal(free.plan, "free");
  });

  it("scopes subscriptions per user", async () => {
    await server.choosePlan("scope-a", "pro");
    await server.choosePlan("scope-b", "free");
    assert.equal((await server.getOrCreateBilling("scope-a")).plan, "pro");
    assert.equal((await server.getOrCreateBilling("scope-b")).plan, "free");
  });
});
