import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { CreationConfig } from "../creations/types.ts";
import type { LabParams } from "../../engine/types.ts";
import type { AdminComment, PublicComment } from "./types.ts";

// Same PGLite glob-loader hook as the sibling suites: resolves the `@/` alias
// and inlines the REAL migration SQL (0004/0005 for creations + profiles, and
// the new 0012_social for creation_comments), so this suite hits a genuine
// PGLite database — no DB mocking, no seeded fixtures beyond the rows it
// inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

type CommentsServer = {
  insertComment: (
    userId: string,
    creationId: string,
    body: string,
  ) => Promise<PublicComment | null>;
  listPublicComments: (creationId: string) => Promise<PublicComment[]>;
  listAdminComments: (creationId: string) => Promise<AdminComment[]>;
  hideComment: (id: string, hidden: boolean) => Promise<boolean>;
  deleteComment: (id: string) => Promise<boolean>;
};

type CreationsServer = {
  insertCreation: (userId: string, name: string, config: CreationConfig) => Promise<{ id: string }>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
};

let comments: CommentsServer;
let creations: CreationsServer;
let validConfig: () => CreationConfig;

before(async () => {
  comments = (await import("./server.ts")) as unknown as CommentsServer;
  creations = (await import("../creations/server.ts")) as unknown as CreationsServer;
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

describe("creation comments — real PGLite (Item 9)", () => {
  it("posts on a public creation, lists it, and excludes hidden from the public list", async () => {
    const owner = "cmt-owner";
    const creation = await creations.insertCreation(owner, "Commentable", validConfig());
    await creations.setCreationPublic(owner, creation.id, true);

    const posted = await comments.insertComment("commenter-1", creation.id, "beautiful");
    assert.ok(posted, "a comment on a public creation is accepted");
    assert.equal(posted!.body, "beautiful");

    const second = await comments.insertComment("commenter-2", creation.id, "nice work");
    assert.ok(second);

    // Public list shows both, newest first.
    let list = await comments.listPublicComments(creation.id);
    assert.equal(list.length, 2, "both comments appear in the public list");
    assert.equal(list[0].id, second!.id, "newest comment is first");

    // Hide one; it disappears from the public list but remains for admins.
    assert.equal(await comments.hideComment(posted!.id, true), true);
    list = await comments.listPublicComments(creation.id);
    assert.ok(
      !list.some((c) => c.id === posted!.id),
      "a hidden comment is excluded from the public list",
    );
    const adminList = await comments.listAdminComments(creation.id);
    assert.ok(
      adminList.some((c) => c.id === posted!.id && c.hidden === true),
      "the admin list still shows the hidden comment flagged",
    );

    // Delete removes it entirely.
    assert.equal(await comments.deleteComment(second!.id), true);
    const afterDelete = await comments.listPublicComments(creation.id);
    assert.ok(!afterDelete.some((c) => c.id === second!.id), "deleted comment is gone");
  });

  it("rejects a comment on a PRIVATE (or unknown) creation", async () => {
    const owner = "cmt-priv-owner";
    const priv = await creations.insertCreation(owner, "Secret", validConfig());
    // priv stays private (never published).
    const rejected = await comments.insertComment("intruder", priv.id, "let me in");
    assert.equal(rejected, null, "a comment on a private creation is rejected");

    const unknown = await comments.insertComment("intruder", "no-such-creation", "hello");
    assert.equal(unknown, null, "a comment on an unknown creation is rejected");
  });

  it("is PII-free: the public projection carries a display name, never an email", async () => {
    const owner = "cmt-pii-owner";
    const creation = await creations.insertCreation(owner, "PII check", validConfig());
    await creations.setCreationPublic(owner, creation.id, true);
    await comments.insertComment("someone", creation.id, "no email here");
    const list = await comments.listPublicComments(creation.id);
    assert.ok(!JSON.stringify(list).includes("@"), "public comments must not leak an email");
  });
});

describe("comment body validation (Item 9)", () => {
  it("enforces the body length cap via the zod schema", async () => {
    const { postCommentSchema, COMMENT_BODY_MAX } = await import("./types.ts");
    const tooLong = "x".repeat(COMMENT_BODY_MAX + 1);
    assert.equal(
      postCommentSchema.safeParse({ creationId: "c1", body: tooLong }).success,
      false,
      "a body over the cap is rejected",
    );
    // An empty / whitespace-only body is rejected.
    assert.equal(
      postCommentSchema.safeParse({ creationId: "c1", body: "   " }).success,
      false,
      "a blank body is rejected",
    );
    // A valid body at the cap passes.
    const ok = postCommentSchema.safeParse({ creationId: "c1", body: "x".repeat(COMMENT_BODY_MAX) });
    assert.equal(ok.success, true, "a body at the cap is accepted");
  });
});
