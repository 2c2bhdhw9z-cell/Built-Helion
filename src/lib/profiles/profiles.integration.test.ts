import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationConfig } from "../creations/types.ts";
import type { LabParams } from "../../engine/types.ts";
import type { PublicProfile } from "./types.ts";

// Same PGLite glob-loader hook as the sibling suites: resolves the `@/` alias
// and inlines the REAL migration SQL (0005_community for profiles/creation_likes,
// 0009_completion for the achievements table, 0011 for lineage), so this suite
// hits a genuine PGLite database — no DB mocking, no seeded fixtures beyond the
// rows it inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type ProfilesServer = {
  getPublicProfile: (userId: string) => Promise<PublicProfile>;
  upsertProfile: (
    userId: string,
    patch: { displayName: string; bio: string; hue: number },
  ) => Promise<unknown>;
};

type CreationsServer = {
  insertCreation: (userId: string, name: string, config: CreationConfig) => Promise<{ id: string }>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
  toggleLike: (userId: string, creationId: string) => Promise<{ liked: boolean; likeCount: number }>;
};

type AchievementsServer = {
  grantIfEarned: (
    userId: string,
    metrics: { peak: number; seconds: number },
  ) => Promise<unknown>;
};

let profiles: ProfilesServer;
let creations: CreationsServer;
let achievements: AchievementsServer;
let validConfig: () => CreationConfig;

before(async () => {
  profiles = (await import("./server.ts")) as unknown as ProfilesServer;
  creations = (await import("../creations/server.ts")) as unknown as CreationsServer;
  achievements = (await import("../achievements/server.ts")) as unknown as AchievementsServer;
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

describe("public creator profile — real PGLite (Item 8)", () => {
  it("returns display name/bio/hue, public gallery + stats, badges — never private data", async () => {
    const author = "prof-author";
    await profiles.upsertProfile(author, { displayName: "Nova", bio: "loves particles", hue: 200 });

    const pub1 = await creations.insertCreation(author, "Public One", validConfig());
    const pub2 = await creations.insertCreation(author, "Public Two", validConfig());
    const priv = await creations.insertCreation(author, "Secret Draft", validConfig());
    await creations.setCreationPublic(author, pub1.id, true);
    await creations.setCreationPublic(author, pub2.id, true);
    // priv stays private.

    // pub1 gets 2 likes; a like on the private one is rejected (public-only).
    await creations.toggleLike("fan-1", pub1.id);
    await creations.toggleLike("fan-2", pub1.id);
    const privLike = await creations.toggleLike("fan-1", priv.id);
    assert.equal(privLike.liked, false, "a private creation cannot be liked");

    // Grant an achievement so a badge appears on the public profile.
    await achievements.grantIfEarned(author, { peak: 1_000_000, seconds: 0 });

    const profile = await profiles.getPublicProfile(author);

    assert.equal(profile.found, true);
    assert.equal(profile.displayName, "Nova");
    assert.equal(profile.bio, "loves particles");
    assert.equal(profile.hue, 200);

    // Stats count only PUBLIC work.
    assert.equal(profile.publicCount, 2, "only the two public creations count");
    assert.equal(profile.totalLikes, 2, "two likes on public creations");

    // Gallery excludes the private creation entirely.
    const galleryIds = profile.gallery.map((g) => g.id);
    assert.ok(galleryIds.includes(pub1.id) && galleryIds.includes(pub2.id));
    assert.ok(!galleryIds.includes(priv.id), "a private creation must never appear in the gallery");
    // Ordered by likes desc: pub1 (2 likes) first.
    assert.equal(profile.gallery[0].id, pub1.id, "most-liked public creation ranks first");
    assert.equal(profile.gallery[0].likeCount, 2);

    // Earned badge is projected with its public label.
    assert.ok(
      profile.badges.some((b) => b.id === "million" && b.label.length > 0),
      "the earned achievement is surfaced as a labelled badge",
    );

    // PII discipline: the serialized bundle contains no '@' (no email) anywhere.
    assert.ok(!JSON.stringify(profile).includes("@"), "public profile must not leak an email");
  });

  it("degrades gracefully for an unknown creator", async () => {
    const profile = await profiles.getPublicProfile("no-such-user");
    assert.equal(profile.found, false, "an unknown creator is not found");
    assert.equal(profile.publicCount, 0);
    assert.equal(profile.gallery.length, 0);
    assert.equal(profile.badges.length, 0);
  });
});
