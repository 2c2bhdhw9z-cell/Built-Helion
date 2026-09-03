import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { DEFAULT_PROFILE, updateProfileSchema, type Profile } from "./types.ts";

register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type ProfilesServer = {
  getProfile: (userId: string) => Promise<Profile>;
  upsertProfile: (
    userId: string,
    patch: { displayName: string; bio: string; hue: number },
  ) => Promise<Profile>;
};

describe("profile model", () => {
  it("DEFAULT_PROFILE is empty with the teal hue", () => {
    assert.equal(DEFAULT_PROFILE.displayName, "");
    assert.equal(DEFAULT_PROFILE.bio, "");
    assert.equal(DEFAULT_PROFILE.hue, 168);
    assert.equal(DEFAULT_PROFILE.saves, 0);
    assert.equal(DEFAULT_PROFILE.likes, 0);
  });

  it("updateProfileSchema trims and caps fields", () => {
    const parsed = updateProfileSchema.parse({
      displayName: "  Nova  ",
      bio: " hello ",
      hue: 40,
    });
    assert.equal(parsed.displayName, "Nova");
    assert.equal(parsed.bio, "hello");
    assert.equal(parsed.hue, 40);
    assert.equal(updateProfileSchema.safeParse({ displayName: "x".repeat(41), bio: "", hue: 0 }).success, false);
    assert.equal(updateProfileSchema.safeParse({ displayName: "", bio: "", hue: 400 }).success, false);
  });
});

describe("profiles DB round trip (real PGLite, migration 0005)", () => {
  let server: ProfilesServer;

  before(async () => {
    server = (await import("./server.ts")) as unknown as ProfilesServer;
  });

  it("unknown user returns defaults and zero stats", async () => {
    const p = await server.getProfile("no-profile-yet");
    assert.deepEqual(p, DEFAULT_PROFILE);
  });

  it("upsert then get round-trips display name / bio / hue", async () => {
    const saved = await server.upsertProfile("profile-user", {
      displayName: "Ion",
      bio: "spawns galaxies",
      hue: 12,
    });
    assert.equal(saved.displayName, "Ion");
    assert.equal(saved.bio, "spawns galaxies");
    assert.equal(saved.hue, 12);

    const loaded = await server.getProfile("profile-user");
    assert.equal(loaded.displayName, "Ion");
    assert.equal(loaded.bio, "spawns galaxies");
    assert.equal(loaded.hue, 12);
  });
});
