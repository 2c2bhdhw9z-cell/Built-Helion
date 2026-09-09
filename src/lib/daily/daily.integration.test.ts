import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationRow } from "../creations/types.ts";
import type { DailyBoardEntry, DailyChallenge } from "./types.ts";

// Same PGLite glob-loader hook as the sibling suites: it resolves the `@/`
// alias and inlines the REAL migration SQL (including migrations/0005_community
// for creation_likes/profiles, 0011_creation_lineage for parent_id, and the new
// 0012_social for daily_challenges), so this suite hits a genuine PGLite
// database — no DB mocking, no seeded fixtures beyond the rows it inserts.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type DailyServer = {
  getOrCreateChallenge: (when?: Date | string) => Promise<DailyChallenge>;
  listChallengeBoard: (when?: Date | string) => Promise<DailyBoardEntry[]>;
};

type CreationsServer = {
  forkCreation: (userId: string, sourceId: string) => Promise<CreationRow | null>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
  toggleLike: (userId: string, creationId: string) => Promise<{ liked: boolean; likeCount: number }>;
};

let daily: DailyServer;
let creations: CreationsServer;

before(async () => {
  daily = (await import("./server.ts")) as unknown as DailyServer;
  creations = (await import("../creations/server.ts")) as unknown as CreationsServer;
});

describe("daily challenge board — real PGLite (Item 7)", () => {
  it("lazily materializes today's seed as a public, forkable creation", async () => {
    const day = "2031-01-05";
    const challenge = await daily.getOrCreateChallenge(day);
    assert.equal(challenge.day, day);
    assert.ok(challenge.seedCreationId.length > 0, "a seed creation id is recorded");
    // The seed config is valid and loadable.
    assert.ok(challenge.config.spawnKind, "seed carries a generator kind");

    // Re-fetching the same day returns the SAME seed creation id (idempotent).
    const again = await daily.getOrCreateChallenge(day);
    assert.equal(again.seedCreationId, challenge.seedCreationId, "same day → same seed creation");

    // Because the seed is a real PUBLIC creation, it can be forked (remixed).
    const forked = await creations.forkCreation("daily-remixer", challenge.seedCreationId);
    assert.ok(forked, "the seed creation is public and forkable");
    assert.equal(forked!.parent_id, challenge.seedCreationId, "fork lineage points at the seed");
  });

  it("ranks public children by likes desc and excludes private children", async () => {
    const day = "2031-02-09";
    const challenge = await daily.getOrCreateChallenge(day);
    const seedId = challenge.seedCreationId;

    // Three remixers fork the seed.
    const hot = await creations.forkCreation("dc-hot", seedId);
    const warm = await creations.forkCreation("dc-warm", seedId);
    const cold = await creations.forkCreation("dc-cold", seedId);
    const secret = await creations.forkCreation("dc-secret", seedId);
    assert.ok(hot && warm && cold && secret);

    // Publish hot/warm/cold; leave `secret` private (a fork starts unlisted).
    assert.equal(await creations.setCreationPublic("dc-hot", hot!.id, true), true);
    assert.equal(await creations.setCreationPublic("dc-warm", warm!.id, true), true);
    assert.equal(await creations.setCreationPublic("dc-cold", cold!.id, true), true);
    // secret stays private.

    // hot gets 2 likes, warm gets 1, cold gets 0.
    await creations.toggleLike("liker-1", hot!.id);
    await creations.toggleLike("liker-2", hot!.id);
    await creations.toggleLike("liker-1", warm!.id);
    // A like on the PRIVATE child must be rejected (public-only rule).
    const secretLike = await creations.toggleLike("liker-1", secret!.id);
    assert.equal(secretLike.liked, false, "a private child cannot be liked");

    const board = await daily.listChallengeBoard(day);
    const ids = board.map((e) => e.id);

    // Private child excluded entirely.
    assert.ok(!ids.includes(secret!.id), "a private child must not appear on the board");
    // All three public children present.
    assert.ok(ids.includes(hot!.id) && ids.includes(warm!.id) && ids.includes(cold!.id));

    // Ordered by like count desc: hot(2) > warm(1) > cold(0).
    assert.equal(board[0].id, hot!.id, "most-liked entry ranks first");
    assert.equal(board[0].likeCount, 2);
    assert.equal(board[1].id, warm!.id, "second-most-liked ranks second");
    assert.equal(board[1].likeCount, 1);
    const coldEntry = board.find((e) => e.id === cold!.id);
    assert.equal(coldEntry?.likeCount, 0, "an unliked public entry appears with 0 likes");

    // PII-free: entries carry only a display-name label, never an email.
    for (const entry of board) {
      assert.ok(typeof entry.author === "string");
      assert.ok(!entry.author.includes("@"), "author label is never an email");
    }
  });
});
