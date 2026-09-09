import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Same loader hook as control.test.ts / admin.integration.test.ts: it resolves
// the `@/` alias and inlines the REAL migration SQL (top-level migrations/*.sql,
// including 0004_creations.sql, 0006_phase2.sql `api_tokens`, 0007_rest.sql
// `api_commands`, and 0009_completion.sql `account_status`) so handleV1 runs
// against a genuine PGLite database — no DB mocking, no seeded fixtures beyond
// the rows this test inserts itself.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// Everything that transitively touches `@/` (handle.ts → db.ts, tokens.ts) must
// be imported dynamically AFTER register() runs, else a static top-level import
// is hoisted and resolved before the loader hook is active.
let handleV1: typeof import("./handle.ts").handleV1;
let insertToken: typeof import("./tokens.ts").insertToken;
let getSql: () => Promise<import("../db.ts").Sql>;

before(async () => {
  ({ handleV1 } = await import("./handle.ts"));
  ({ insertToken } = await import("./tokens.ts"));
  ({ getSql } = (await import("../db.ts")) as unknown as {
    getSql: () => Promise<import("../db.ts").Sql>;
  });
});

function postRequest(path: string, token: string, body: unknown, ip: string): Request {
  return new Request(`http://localhost/api/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function setSuspended(userId: string, suspended: boolean): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into account_status (user_id, suspended, updated_at)
    values (${userId}, ${suspended}, now())
    on conflict (user_id) do update set suspended = excluded.suspended, updated_at = now()
  `;
}

// ---------------------------------------------------------------------------
// A suspended account may still READ, but every authenticated WRITE must reject
// (Req 5.3). The REST surface authenticates by bearer token rather than a
// session, so it needs the SAME `assertNotSuspended` gate the session server
// functions apply — otherwise a suspended account with a live API token could
// keep writing (save a creation, queue a control command) and bypass the
// suspension entirely.
// ---------------------------------------------------------------------------

describe("REST /api/v1 write handlers honor account suspension (Req 5.3)", () => {
  const validConfig = { config: {}, name: "Suspend gate scene" };

  it("allows writes while the account is NOT suspended, then rejects them once suspended", async () => {
    const userId = "rest-suspend-gate-user";
    const { raw } = await insertToken(userId, "suspend-gate-token");

    // Not suspended (no account_status row): both writes succeed.
    const okSave = await handleV1(
      postRequest("creations", raw, validConfig, "10.0.0.1"),
    );
    assert.equal(okSave.status, 201, "an un-suspended account can save a creation");

    const okControl = await handleV1(
      postRequest("control", raw, { type: "spawn", spawnCount: 100 }, "10.0.0.1"),
    );
    assert.equal(okControl.status, 202, "an un-suspended account can queue a control command");

    // Suspend the account.
    await setSuspended(userId, true);

    // Both write paths must now reject with 403 (and NOT touch the data layer).
    const blockedSave = await handleV1(
      postRequest("creations", raw, validConfig, "10.0.0.2"),
    );
    assert.equal(blockedSave.status, 403, "a suspended account cannot save a creation via REST");

    const blockedControl = await handleV1(
      postRequest("control", raw, { type: "spawn", spawnCount: 100 }, "10.0.0.2"),
    );
    assert.equal(
      blockedControl.status,
      403,
      "a suspended account cannot queue a control command via REST",
    );

    // Prove the blocked writes never reached the store: the account still has
    // exactly the ONE creation and ONE queued command from before suspension.
    const sql = await getSql();
    const creations = await sql<{ n: string | number }>`
      select count(*) as n from creations where user_id = ${userId}
    `;
    assert.equal(Number(creations[0]!.n), 1, "no creation was written while suspended");
    const commands = await sql<{ n: string | number }>`
      select count(*) as n from api_commands where user_id = ${userId}
    `;
    assert.equal(Number(commands[0]!.n), 1, "no control command was queued while suspended");
  });

  it("reinstating the account restores write access", async () => {
    const userId = "rest-reinstate-user";
    const { raw } = await insertToken(userId, "reinstate-token");

    await setSuspended(userId, true);
    const blocked = await handleV1(postRequest("creations", raw, validConfig, "10.0.0.3"));
    assert.equal(blocked.status, 403, "suspended account is blocked");

    await setSuspended(userId, false);
    const allowed = await handleV1(postRequest("creations", raw, validConfig, "10.0.0.3"));
    assert.equal(allowed.status, 201, "a reinstated account can write again");
  });
});
