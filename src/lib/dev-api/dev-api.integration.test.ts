import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Same loader hook as the sibling integration suites: it resolves the `@/`
// alias and inlines the REAL migration SQL (the top-level migrations/*.sql
// files, INCLUDING 0008's `webhooks`/`webhook_deliveries` and 0015's
// `api_usage_daily`) so this suite hits a genuine PGLite database — no DB
// mocking, no seeded fixtures beyond the rows this test inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// tokens.ts imports the `@/` alias (getSql), which only resolves once the loader
// hook above is registered; a static top-level import would be hoisted and
// resolved BEFORE register() runs. So — like the sibling suites — the module is
// imported dynamically inside a before() hook.

type Tokens = {
  bumpApiUsageDaily: (userId: string, at?: Date) => Promise<void>;
  readApiUsageDaily: (userId: string, days?: number) => Promise<{ day: string; count: number }[]>;
  API_USAGE_RETENTION_DAYS: number;
  insertWebhook: (userId: string, url: string) => Promise<{ id: string; url: string }>;
  testWebhook: (
    userId: string,
    webhookId: string,
  ) => Promise<import("./tokens.ts").DeliveryRow | null>;
  listDeliveries: (userId: string) => Promise<import("./tokens.ts").DeliveryRow[]>;
};

type Db = { getSql: () => Promise<import("../db.ts").Sql> };

let tokens: Tokens;
let getSql: Db["getSql"];

before(async () => {
  tokens = (await import("./tokens.ts")) as unknown as Tokens;
  ({ getSql } = (await import("../db.ts")) as unknown as Db);
});

describe("api_usage_daily rollup (Item 19)", () => {
  it("upsert increments the per-day counter for a user", async () => {
    const day = new Date("2024-03-10T12:00:00Z");
    await tokens.bumpApiUsageDaily("usage-u1", day);
    await tokens.bumpApiUsageDaily("usage-u1", day);
    await tokens.bumpApiUsageDaily("usage-u1", day);

    const sql = await getSql();
    const rows = await sql<{ count: number | string }>`
      select count from api_usage_daily where user_id = 'usage-u1' and day = '2024-03-10'
    `;
    assert.equal(Number(rows[0]?.count), 3, "three bumps on the same day sum to 3");
  });

  it("counts each day separately and reads back the trailing window zero-filled", async () => {
    const now = new Date();
    const today = now;
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    await tokens.bumpApiUsageDaily("usage-u2", today);
    await tokens.bumpApiUsageDaily("usage-u2", today);
    await tokens.bumpApiUsageDaily("usage-u2", twoDaysAgo);

    const daily = await tokens.readApiUsageDaily("usage-u2", 7);
    assert.equal(daily.length, 7, "window is zero-filled to the requested day count");
    // Ascending by day (oldest → newest).
    for (let i = 1; i < daily.length; i++) {
      assert.ok(daily[i - 1]!.day <= daily[i]!.day, "days ascend");
    }
    const total = daily.reduce((s, d) => s + d.count, 0);
    assert.equal(total, 3, "the window sums to the three recorded requests");
    const todayKey = today.toISOString().slice(0, 10);
    const todayRow = daily.find((d) => d.day === todayKey);
    assert.equal(todayRow?.count, 2, "today shows the two bumps");
  });

  // Finding 3: `api_usage_daily` must stay bounded like `api_rate_limits`. The
  // best-effort, throttled, fire-and-forget retention sweep in
  // `bumpApiUsageDaily` prunes rows older than API_USAGE_RETENTION_DAYS. This
  // seeds a very old row, resets the per-process throttle guard so the sweep is
  // guaranteed to fire on the next bump, and asserts the old row is gone while a
  // recent row survives.
  it("prunes api_usage_daily rows older than the retention window", async () => {
    const sql = await getSql();
    const retention = tokens.API_USAGE_RETENTION_DAYS;

    // A row well beyond the retention window (retention + 10 days ago) and a
    // fresh row from today.
    const oldDay = new Date(Date.now() - (retention + 10) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await sql`
      insert into api_usage_daily (user_id, day, count)
      values ('usage-prune', ${oldDay}, 5)
      on conflict (user_id, day) do update set count = excluded.count
    `;
    const seeded = await sql<{ count: number | string }>`
      select count(*) as count from api_usage_daily where day = ${oldDay}
    `;
    assert.equal(Number(seeded[0]?.count), 1, "the stale row is seeded");

    // The sweep is throttled to once per UTC day per process; earlier tests in
    // this process may have already tripped that guard, so reset it to force the
    // sweep to fire on this bump. (Mirrors how we reason about the rate-limit
    // global sweep's once-per-window guard.)
    (globalThis as { __apiUsageDailySweptDay__?: string }).__apiUsageDailySweptDay__ = undefined;

    // A normal bump today triggers the retention sweep as a side effect.
    await tokens.bumpApiUsageDaily("usage-prune");

    // The sweep is fire-and-forget; give the async delete a moment to complete.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const oldAfter = await sql<{ count: number | string }>`
      select count(*) as count from api_usage_daily where day = ${oldDay}
    `;
    assert.equal(Number(oldAfter[0]?.count), 0, "the stale row was pruned");

    const todayKey = new Date().toISOString().slice(0, 10);
    const recentAfter = await sql<{ count: number | string }>`
      select count from api_usage_daily where user_id = 'usage-prune' and day = ${todayKey}
    `;
    assert.equal(Number(recentAfter[0]?.count), 1, "the fresh row within retention survives");
  });

  it("is per-user isolated (one user's usage never appears in another's read)", async () => {
    const day = new Date();
    await tokens.bumpApiUsageDaily("usage-iso-a", day);
    await tokens.bumpApiUsageDaily("usage-iso-a", day);
    await tokens.bumpApiUsageDaily("usage-iso-b", day);

    const a = await tokens.readApiUsageDaily("usage-iso-a", 3);
    const b = await tokens.readApiUsageDaily("usage-iso-b", 3);
    assert.equal(
      a.reduce((s, d) => s + d.count, 0),
      2,
      "user A sees only their own 2 requests",
    );
    assert.equal(
      b.reduce((s, d) => s + d.count, 0),
      1,
      "user B sees only their own 1 request",
    );
  });
});

describe("insertWebhook SSRF allowlist at registration (Finding 5)", () => {
  it("rejects a non-https / private-host webhook URL and stores nothing", async () => {
    // http and RFC1918/loopback/link-local targets must be refused at
    // registration so an SSRF target never lands in the table.
    await assert.rejects(
      () => tokens.insertWebhook("ssrf-user", "http://example.com/hook"),
      "plain http is rejected",
    );
    await assert.rejects(
      () => tokens.insertWebhook("ssrf-user", "https://169.254.169.254/latest/meta-data/"),
      "cloud-metadata link-local address is rejected",
    );
    await assert.rejects(
      () => tokens.insertWebhook("ssrf-user", "https://127.0.0.1/hook"),
      "loopback is rejected",
    );

    // A public https URL is accepted.
    const ok = await tokens.insertWebhook("ssrf-user", "https://hooks.example.com/hook");
    assert.ok(ok.id, "a public https webhook registers");
  });
});

describe("testWebhook delivery recording (Item 20)", () => {
  it("records a test delivery that appears in the owner's deliveries list", async () => {
    // Register a webhook to a public but unreachable https URL (the `.invalid`
    // TLD never resolves) — the outbound POST fails, but the delivery MUST still
    // be recorded (ok=false) so it shows in the log. A public https target is
    // required now that registration enforces the SSRF allowlist (Finding 5).
    const hook = await tokens.insertWebhook("hook-owner", "https://webhook-test.invalid/hook");

    const before = await tokens.listDeliveries("hook-owner");
    const delivery = await tokens.testWebhook("hook-owner", hook.id);
    assert.ok(delivery, "a test delivery is returned for the owner's own webhook");
    assert.equal(delivery!.event, "test.ping", "the test event is labelled");
    assert.equal(delivery!.webhookId, hook.id);

    const after = await tokens.listDeliveries("hook-owner");
    assert.equal(after.length, before.length + 1, "exactly one delivery was recorded");
    assert.equal(after[0]!.webhookId, hook.id, "the recorded delivery is for this webhook");
    assert.equal(after[0]!.event, "test.ping");
    // Finding 4: the returned delivery id must be the id actually inserted, not
    // a fabricated one — so the object handed back matches the persisted row.
    assert.equal(
      delivery!.id,
      after[0]!.id,
      "the returned delivery id equals the persisted row's id",
    );
    // The unreachable URL fails and retries once → attempts = 2, ok = false.
    assert.equal(after[0]!.ok, false, "an unreachable URL records a failed delivery");
    assert.equal(after[0]!.attempts, 2, "a failed delivery retries once");
  });

  it("is owner-scoped: a user cannot test someone else's webhook", async () => {
    const hook = await tokens.insertWebhook("hook-alice", "https://webhook-test.invalid/hook");

    // Bob tries to test Alice's webhook by id → resolves to null, no delivery.
    const before = await tokens.listDeliveries("hook-bob");
    const result = await tokens.testWebhook("hook-bob", hook.id);
    assert.equal(result, null, "testing a foreign webhook returns null (no fire)");
    const after = await tokens.listDeliveries("hook-bob");
    assert.equal(after.length, before.length, "no delivery is recorded for the non-owner");

    // And Alice's own deliveries are untouched by Bob's attempt.
    const aliceDeliveries = await tokens.listDeliveries("hook-alice");
    assert.ok(
      aliceDeliveries.every((d) => d.event !== "test.ping" || d.webhookId === hook.id),
      "Alice's log is not polluted by Bob's failed attempt",
    );
  });
});
