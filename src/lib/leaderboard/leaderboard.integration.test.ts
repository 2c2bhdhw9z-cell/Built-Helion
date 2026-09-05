import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationConfig } from "../creations/types.ts";
import type { LabParams } from "../../engine/types.ts";
import type { LeaderboardEntry } from "./types.ts";

// Same loader hook as creations.test.ts / admin.integration.test.ts: it
// resolves the `@/` alias and inlines the REAL migration SQL (the top-level
// migrations/*.sql files, INCLUDING 0001_auth.sql which creates the Better
// Auth `"user"` table, 0004_creations.sql, 0005_community.sql which creates
// `creation_likes` + `profiles`, and 0009_completion.sql) so this suite hits a
// genuine PGLite database — no DB mocking, no seeded fixtures beyond the rows
// this test inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// The engine/config types and the server modules import the `@/` alias, which
// only resolves once the loader hook above is registered; a static top-level
// import would be hoisted and resolved BEFORE register() runs. So — like the
// sibling suites — everything that transitively touches `@/` is imported
// dynamically inside a before() hook, after the loader is active.

type LeaderboardServer = {
  listLeaderboard: (limit?: number) => Promise<LeaderboardEntry[]>;
};

type CreationsServer = {
  insertCreation: (userId: string, name: string, config: CreationConfig) => Promise<{ id: string }>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
  toggleLike: (userId: string, creationId: string) => Promise<{ liked: boolean; likeCount: number }>;
};

type Db = { getSql: () => Promise<import("../db.ts").Sql> };

let leaderboard: LeaderboardServer;
let creations: CreationsServer;
let getSql: Db["getSql"];
let validConfig: () => CreationConfig;

before(async () => {
  leaderboard = (await import("./server.ts")) as unknown as LeaderboardServer;
  creations = (await import("../creations/server.ts")) as unknown as CreationsServer;
  ({ getSql } = (await import("../db.ts")) as unknown as Db);

  const types = await import("../creations/types.ts");
  const engineTypes = await import("../../engine/types.ts");
  const DEFAULT_PARAMS: LabParams = engineTypes.DEFAULT_PARAMS;
  validConfig = () =>
    types.creationConfigSchema.parse({
      params: { ...DEFAULT_PARAMS },
      spawnKind: "galaxy",
      spawnCount: 5000,
      speed: 1,
      cap: 131_072,
    });
});

/**
 * Seed a minimal Better Auth `"user"` row plus a matching `profiles` row so the
 * creator carries a stable display name. `listLeaderboard` derives the label
 * from `profiles.display_name` (LEFT JOIN), so the profile row is what surfaces
 * the name on the board; the `"user"` row keeps the account real for parity
 * with the sibling admin suite. The `"user"` table requires non-null
 * name/email/emailVerified. Emails here are synthetic test values, not PII.
 */
async function seedCreator(id: string, displayName: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into "user" ("id", "name", "email", "emailVerified")
    values (${id}, ${displayName}, ${`${id}@test.local`}, ${true})
    on conflict ("id") do nothing
  `;
  await sql`
    insert into profiles ("user_id", "display_name")
    values (${id}, ${displayName})
    on conflict ("user_id") do update set display_name = excluded.display_name
  `;
}

describe("leaderboard data layer — real public-creation/like rows (Reqs 7.1, 7.2, 7.3)", () => {
  it("ranks non-increasing by score, breaks ties by userId ascending, and excludes private-only creators", async () => {
    // Four creators seeded with a shared suffix so we can isolate this test's
    // rows from any that other suites left in the shared in-process PGLite.
    //
    //  - lb-a: 1 public creation, 2 likes received  -> score 1 + 2 = 3 (top)
    //  - lb-b: 1 public creation, 0 likes received  -> score 1 + 0 = 1
    //  - lb-c: 1 public creation, 0 likes received  -> score 1 + 0 = 1 (ties lb-b)
    //  - lb-z: 1 PRIVATE creation only               -> excluded entirely
    await seedCreator("lb-a", "Aster");
    await seedCreator("lb-b", "Beryl");
    await seedCreator("lb-c", "Cyan");
    await seedCreator("lb-z", "Zephyr");
    // Two likers whose own creations are irrelevant to the board.
    await seedCreator("lb-liker1", "Liker One");
    await seedCreator("lb-liker2", "Liker Two");

    const a1 = await creations.insertCreation("lb-a", "A One", validConfig());
    const b1 = await creations.insertCreation("lb-b", "B One", validConfig());
    const c1 = await creations.insertCreation("lb-c", "C One", validConfig());
    const z1 = await creations.insertCreation("lb-z", "Z One", validConfig());

    // Publish a, b, c; leave z private so the private-only creator is excluded.
    await creations.setCreationPublic("lb-a", a1.id, true);
    await creations.setCreationPublic("lb-b", b1.id, true);
    await creations.setCreationPublic("lb-c", c1.id, true);
    // z stays private (never published) — sanity: a like on a private creation
    // is rejected, so z can never accrue score.
    const zLike = await creations.toggleLike("lb-liker1", z1.id);
    assert.equal(zLike.liked, false, "a private creation must not be likeable");

    // a receives two likes from two distinct users; b and c receive none.
    const l1 = await creations.toggleLike("lb-liker1", a1.id);
    assert.equal(l1.liked, true, "a public creation must be likeable");
    const l2 = await creations.toggleLike("lb-liker2", a1.id);
    assert.equal(l2.likeCount, 2, "two distinct users liked a's public creation");

    const board = await leaderboard.listLeaderboard();

    // Isolate this test's creators from any shared-instance rows.
    const mine = board.filter((e) => ["lb-a", "lb-b", "lb-c", "lb-z"].includes(e.userId));

    // Private-only creator z never appears (Req 7.3).
    assert.ok(
      !mine.some((e) => e.userId === "lb-z"),
      "a creator with only private work must be excluded from the board",
    );

    // The three public creators are all present with the expected scores.
    const a = mine.find((e) => e.userId === "lb-a");
    const b = mine.find((e) => e.userId === "lb-b");
    const c = mine.find((e) => e.userId === "lb-c");
    assert.ok(a && b && c, "all three public creators must appear on the board");
    assert.equal(a.score, 3, "a = 1 per-public-creation weight + 2 likes");
    assert.equal(b.score, 1, "b = 1 per-public-creation weight + 0 likes");
    assert.equal(c.score, 1, "c = 1 per-public-creation weight + 0 likes");
    assert.equal(a.displayName, "Aster", "display name comes from the profile row");

    // Ordering across the WHOLE board is non-increasing by score (Req 7.1).
    for (let i = 1; i < board.length; i++) {
      assert.ok(
        board[i - 1].score >= board[i].score,
        `board must be non-increasing by score at position ${i}`,
      );
    }

    // Equal-score entries are ordered by userId ascending — a stable tie-break
    // (Req 7.2). Within this test's rows b (score 1) and c (score 1) tie, and
    // "lb-b" < "lb-c", so b must precede c on the board.
    const bIndex = board.findIndex((e) => e.userId === "lb-b");
    const cIndex = board.findIndex((e) => e.userId === "lb-c");
    assert.ok(bIndex < cIndex, "equal-score ties order by userId ascending (lb-b before lb-c)");

    // a outranks both tied creators (higher score).
    const aIndex = board.findIndex((e) => e.userId === "lb-a");
    assert.ok(aIndex < bIndex && aIndex < cIndex, "the higher-scoring creator ranks first");

    // Ranks are the 1-based positions in the returned ordering.
    assert.equal(board[0].rank, 1, "the first entry has rank 1");
  });
});
