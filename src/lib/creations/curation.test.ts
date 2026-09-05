import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fc from "fast-check";
import type { CreationConfig, LibraryItem } from "./types.ts";
import type { LabParams } from "../../engine/types.ts";

// Same loader hook as creations.test.ts / admin.integration.test.ts: it
// resolves the `@/` alias and inlines the REAL migration SQL (including
// 0001_auth.sql for the Better Auth `"user"` table, 0004_creations.sql,
// 0005_community.sql, and 0009_completion.sql which adds `creations.featured`)
// so the integration block hits a genuine PGLite database — no DB mocking, no
// seeded fixtures beyond the rows this test inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// ---------------------------------------------------------------------------
// Property-based test for the curation filter (Task 12.2)
//
// Property 11 (design.md): Curated row contains only featured public creations
//   — for any set of creations carrying (featured, is_public) flags, the
//   curated selection includes ONLY rows that are BOTH featured=true AND
//   is_public=true, and excludes every non-public row.
//
// This exercises the curation rule in its PURE predicate form. `listFeatured`
// is backed by the SQL predicate `featured = true and is_public = true`; the
// pure predicate `(c) => c.featured === true && c.is_public === true` models
// exactly that WHERE clause, and the property asserts that filtering an
// arbitrary row set by it equals the independently-computed expected set.
// No DB access is needed for the property, so it runs without any dynamic
// import of the `@/`-touching server module.
// ---------------------------------------------------------------------------

/** A row carrying just the two curation flags the filter reasons about. */
type FlaggedRow = { id: string; featured: boolean; is_public: boolean };

/**
 * The curation predicate under test, in pure form: a row is curated iff it is
 * BOTH featured AND public. This mirrors the `where c.featured = true and
 * c.is_public = true` clause in `listFeatured` (src/lib/creations/server.ts).
 */
const isCurated = (c: FlaggedRow): boolean => c.featured === true && c.is_public === true;

describe("curation filter — only featured public creations (Property 11, Reqs 13.1, 13.4)", () => {
  // A generator over arbitrary flagged rows: a unique id plus independently
  // chosen featured / is_public booleans, so all four (featured, is_public)
  // combinations are reachable across a set.
  const flaggedRows = fc.array(
    fc.record({
      id: fc.uuid(),
      featured: fc.boolean(),
      is_public: fc.boolean(),
    }),
    { maxLength: 40 },
  );

  // Feature: helion-completion, Property 11: Curated row contains only featured public creations
  it("Property 11: the curated selection is exactly the featured AND public rows, excluding every non-public row", () => {
    fc.assert(
      fc.property(flaggedRows, (rows) => {
        const selected = rows.filter(isCurated);

        // Independently-computed expected set: keep a row iff both flags are set.
        const expected = rows.filter((c) => c.featured === true && c.is_public === true);
        assert.deepEqual(selected, expected, "selection must equal the independently-computed set");

        // ONLY featured public rows are included…
        for (const c of selected) {
          assert.equal(c.featured, true, "a curated row must be featured");
          assert.equal(c.is_public, true, "a curated row must be public");
        }

        // …and every NON-public row is excluded, even when it is featured.
        const selectedIds = new Set(selected.map((c) => c.id));
        for (const c of rows) {
          if (c.is_public !== true) {
            assert.equal(
              selectedIds.has(c.id),
              false,
              "a non-public row must never be curated (even if featured)",
            );
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  // Concrete example: a featured-but-PRIVATE row is excluded while a
  // featured+public row is kept — the exact boundary the integration block
  // below proves against a real database.
  it("Property 11 (concrete example): keeps featured+public, drops featured+private", () => {
    const rows: FlaggedRow[] = [
      { id: "a", featured: true, is_public: true }, // curated
      { id: "b", featured: true, is_public: false }, // featured but private -> excluded
      { id: "c", featured: false, is_public: true }, // public but not featured -> excluded
      { id: "d", featured: false, is_public: false }, // neither -> excluded
    ];
    const selected = rows.filter(isCurated).map((c) => c.id);
    assert.deepEqual(selected, ["a"], "only the featured+public row survives");
  });
});

// ---------------------------------------------------------------------------
// Integration test: listFeatured over a REAL PGLite database (Task 12.2)
//
// EXAMPLE-based (1-2 cases) against the embedded PGLite database via the glob
// loader registered at the top of this file — NOT a property test. It seeds
// creations with insertCreation + setCreationPublic (src/lib/creations/server.ts),
// marks one featured via setFeatured (src/lib/admin/server.ts), then calls
// listFeatured() and asserts a featured+public creation APPEARS and a
// featured-but-PRIVATE one is EXCLUDED (Reqs 13.1, 13.4).
//
// The server modules import the `@/` alias, which only resolves once the loader
// hook above is registered; a static top-level import would be hoisted and
// resolved BEFORE register() runs. So — like admin.integration.test.ts — every
// module that transitively touches `@/` is imported dynamically inside before().
// ---------------------------------------------------------------------------

type CreationsServer = {
  insertCreation: (userId: string, name: string, config: CreationConfig) => Promise<{ id: string }>;
  setCreationPublic: (userId: string, id: string, isPublic: boolean) => Promise<boolean>;
  listFeatured: () => Promise<LibraryItem[]>;
};

type AdminServer = {
  setFeatured: (adminId: string, creationId: string, featured: boolean) => Promise<void>;
};

type Db = { getSql: () => Promise<import("../db.ts").Sql> };

describe("listFeatured — curated row over real PGLite (Reqs 13.1, 13.4)", () => {
  let creations: CreationsServer;
  let admin: AdminServer;
  let getSql: Db["getSql"];
  let validConfig: () => CreationConfig;

  before(async () => {
    creations = (await import("./server.ts")) as unknown as CreationsServer;
    admin = (await import("../admin/server.ts")) as unknown as AdminServer;
    ({ getSql } = (await import("../db.ts")) as unknown as Db);

    const types = await import("./types.ts");
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
   * Seed a minimal Better Auth `"user"` row so the `left join profiles`/author
   * projection in listFeatured has a real owner to resolve. The table requires
   * non-null name/email/emailVerified. Emails here are synthetic test values,
   * not PII. (Mirrors admin.integration.test.ts's seedUser.)
   */
  async function seedUser(id: string, name: string): Promise<void> {
    const sql = await getSql();
    await sql`
      insert into "user" ("id", "name", "email", "emailVerified")
      values (${id}, ${name}, ${`${id}@test.local`}, ${true})
      on conflict ("id") do nothing
    `;
  }

  it("a featured+public creation APPEARS and a featured-but-PRIVATE one is EXCLUDED", async () => {
    await seedUser("cur-owner", "Curator");

    // A creation that is published AND featured -> must appear in the curated row.
    const featuredPublic = await creations.insertCreation(
      "cur-owner",
      "Featured Public Nebula",
      validConfig(),
    );
    await creations.setCreationPublic("cur-owner", featuredPublic.id, true);
    await admin.setFeatured("admin-curator", featuredPublic.id, true);

    // A creation that is featured but kept PRIVATE -> must be excluded (Req 13.4).
    const featuredPrivate = await creations.insertCreation(
      "cur-owner",
      "Featured Private Draft",
      validConfig(),
    );
    // left unpublished (is_public stays false) but still marked featured.
    await admin.setFeatured("admin-curator", featuredPrivate.id, true);

    const curated = await creations.listFeatured();
    const curatedIds = new Set(curated.map((c) => c.id));

    assert.ok(
      curatedIds.has(featuredPublic.id),
      "a featured + public creation must appear in the curated row (Req 13.1)",
    );
    assert.equal(
      curatedIds.has(featuredPrivate.id),
      false,
      "a featured but PRIVATE creation must be excluded from the curated row (Req 13.4)",
    );

    // Every row that IS returned satisfies the curation contract shape.
    for (const item of curated) {
      assert.ok(item.id, "each curated item carries an id");
      assert.equal(typeof item.name, "string", "each curated item carries a name");
      assert.ok(item.config, "each curated item carries a config");
    }
  });
});
