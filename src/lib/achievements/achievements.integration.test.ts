import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { GrantedAchievement } from "./types.ts";

// Same loader hook as creations.test.ts / admin.integration.test.ts: it
// resolves the `@/` alias and inlines the REAL migration SQL (the top-level
// migrations/*.sql files, INCLUDING 0009_completion.sql which creates the
// `achievements` table with the composite primary key `(user_id,
// achievement_id)` that makes grants idempotent) so this suite hits a genuine
// PGLite database — no DB mocking, no seeded fixtures beyond the grants
// grantIfEarned makes.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// The server module imports the `@/` alias, which only resolves once the loader
// hook above is registered; a static top-level import would be hoisted and
// resolved BEFORE register() runs. So — like the sibling suites — the server
// module is imported dynamically inside a before() hook, after the loader is
// active.

type AchievementsServer = {
  grantIfEarned: (
    userId: string,
    metrics: { peak: number; seconds: number },
  ) => Promise<GrantedAchievement[]>;
  listAchievements: (userId: string) => Promise<GrantedAchievement[]>;
};

let achievements: AchievementsServer;

before(async () => {
  achievements = (await import("./server.ts")) as unknown as AchievementsServer;
});

describe("achievements data layer — first-crossing grant + persistence (Reqs 8.1, 8.2, 8.4)", () => {
  it("grants `million` once, persists across a re-read, and grants nothing new at equal/higher metrics", async () => {
    const userId = "ach-crosser";

    // First crossing of the 1M peak threshold (Req 8.1): `million` is granted.
    // seconds is 0 so `day-session` (86,400s) is NOT yet earned.
    const first = await achievements.grantIfEarned(userId, { peak: 1_000_000, seconds: 0 });
    const firstIds = first.map((g) => g.id);
    assert.ok(firstIds.includes("million"), "crossing 1,000,000 peak grants `million`");
    assert.ok(!firstIds.includes("day-session"), "0 seconds must not earn `day-session` yet");
    assert.equal(
      firstIds.filter((id) => id === "million").length,
      1,
      "`million` is granted exactly once",
    );

    // The grant PERSISTS across a fresh read from the DB (Req 8.4) — this is a
    // real table read, not a cached in-memory value.
    const persisted = await achievements.listAchievements(userId);
    assert.ok(
      persisted.some((g) => g.id === "million"),
      "`million` persists across a listAchievements re-read",
    );
    assert.equal(persisted.length, 1, "exactly one achievement is stored for the account");

    // Re-running at an EQUAL metric grants nothing new — the returned set is the
    // same single achievement, never a duplicate (idempotent first-crossing).
    const rerunEqual = await achievements.grantIfEarned(userId, { peak: 1_000_000, seconds: 0 });
    assert.equal(rerunEqual.length, 1, "a re-run at equal metrics adds no new grant");
    assert.equal(
      rerunEqual.filter((g) => g.id === "million").length,
      1,
      "`million` is never duplicated",
    );

    // Re-running at a HIGHER peak (still under the day-session threshold) also
    // grants nothing new — the threshold was already crossed (Req 8.3 idempotency).
    const rerunHigher = await achievements.grantIfEarned(userId, { peak: 5_000_000, seconds: 100 });
    assert.equal(rerunHigher.length, 1, "a re-run at a higher peak adds no new grant");

    // Now cross the 24-hour cumulative-session threshold (86,400 seconds,
    // Req 8.2). `day-session` is added; `million` remains (never removed).
    const dayCross = await achievements.grantIfEarned(userId, { peak: 5_000_000, seconds: 86_400 });
    const dayIds = dayCross.map((g) => g.id);
    assert.ok(dayIds.includes("day-session"), "crossing 86,400 seconds grants `day-session`");
    assert.ok(dayIds.includes("million"), "the previously-earned `million` is retained");
    assert.equal(dayCross.length, 2, "the account now holds exactly two achievements");

    // Final persisted state confirms both grants are durably stored.
    const finalState = await achievements.listAchievements(userId);
    const finalIds = finalState.map((g) => g.id).sort();
    assert.deepEqual(
      finalIds,
      ["day-session", "million"],
      "both achievements persist across a final re-read",
    );
  });
});
