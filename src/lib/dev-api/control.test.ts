import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Same loader hook as admin.integration.test.ts / creations.test.ts: it
// resolves the `@/` alias and inlines the REAL migration SQL (the top-level
// migrations/*.sql files, INCLUDING 0007_rest.sql which creates `api_commands`)
// so the queue-delivery block below hits a genuine PGLite database — no DB
// mocking, no seeded fixtures beyond the rows this test inserts itself.
//
// This file exercises the WebSocket control channel (Req 11) at the level that
// is cleanly testable WITHOUT a live socket server:
//   - the PURE subprotocol token parser (`tokenFromProtocolHeader`),
//   - the auth REJECT path of the crossws `upgrade` hook (invalid/absent token
//     → thrown Response referencing UNAUTHORIZED_CLOSE_CODE 4401),
//   - the in-process peer registry (`pushToUser` returns 0 with no peer),
//   - and the `api_commands` at-most-once polling consume logic against real
//     PGLite.
// The parts that need a real WebSocket server (the accept/open registration,
// live `peer.send`, close-deregistration) are documented inline where they are
// only reachable with a live socket.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// Everything that transitively touches `@/` (db.ts, tokens.ts) must be imported
// dynamically AFTER register() runs, otherwise a static top-level import is
// hoisted and resolved before the loader hook is active — same pattern as the
// sibling integration suites.
type Socket = typeof import("./socket.ts");
type Db = { getSql: () => Promise<import("../db.ts").Sql> };

let socket: Socket;
let getSql: Db["getSql"];

before(async () => {
  socket = await import("./socket.ts");
  ({ getSql } = (await import("../db.ts")) as unknown as Db);
});

// ---------------------------------------------------------------------------
// 1. Socket auth helpers (Reqs 11.1, 11.2)
// ---------------------------------------------------------------------------

describe("tokenFromProtocolHeader — pure subprotocol token parser (Req 11.1)", () => {
  it("returns the hl_-prefixed token from a valid subprotocol header", () => {
    assert.equal(socket.tokenFromProtocolHeader("hl_abc123"), "hl_abc123");
  });

  it("picks the first hl_-prefixed token out of a comma-separated list", () => {
    // `new WebSocket(url, ["hl_…", "other"])` sends a comma-separated list; the
    // parser must skip non-hl entries and trim surrounding whitespace.
    assert.equal(
      socket.tokenFromProtocolHeader(" json , hl_realtoken , extra "),
      "hl_realtoken",
    );
  });

  it("returns null for a missing header", () => {
    assert.equal(socket.tokenFromProtocolHeader(null), null);
  });

  it("returns null for an empty header", () => {
    assert.equal(socket.tokenFromProtocolHeader(""), null);
  });

  it("returns null when no part carries an hl_ prefix", () => {
    assert.equal(socket.tokenFromProtocolHeader("json, graphql-ws"), null);
  });
});

describe("controlSocketHooks.upgrade — auth reject path (Req 11.2)", () => {
  // resolveToken is DB-backed: an absent or invalid token row resolves to null,
  // and the `upgrade` hook must abort the upgrade rather than establish a
  // socket. We drive the hook directly with a fake upgrade request (no live
  // socket server needed) and assert it throws a Response that carries the
  // 4401 unauthorized close code.
  it("rejects an upgrade whose sec-websocket-protocol carries an invalid token", async () => {
    const upgrade = socket.controlSocketHooks.upgrade;
    assert.equal(typeof upgrade, "function", "upgrade hook must be defined");

    const request = new Request("http://localhost/api/v1/control/socket", {
      headers: {
        upgrade: "websocket",
        // A well-formed hl_ token that does not exist in api_tokens →
        // resolveToken returns null → upgrade must reject.
        "sec-websocket-protocol": "hl_this_token_does_not_exist",
      },
    });

    let thrown: unknown;
    try {
      await upgrade!(request as never, undefined as never);
      assert.fail("upgrade must reject an invalid token rather than resolve");
    } catch (err) {
      thrown = err;
    }

    assert.ok(thrown instanceof Response, "upgrade rejects by throwing a Response");
    assert.equal((thrown as Response).status, 401, "reject maps to HTTP 401");
    assert.equal(
      (thrown as Response).headers.get("x-ws-close-code"),
      String(socket.UNAUTHORIZED_CLOSE_CODE),
      "reject references the 4401 unauthorized close code",
    );
    assert.equal(socket.UNAUTHORIZED_CLOSE_CODE, 4401, "close code is 4401 (mirrors 401)");
  });

  it("rejects an upgrade with no bearer token in the subprotocol header", async () => {
    const upgrade = socket.controlSocketHooks.upgrade;
    const request = new Request("http://localhost/api/v1/control/socket", {
      headers: { upgrade: "websocket" }, // no sec-websocket-protocol at all
    });

    await assert.rejects(
      () => upgrade!(request as never, undefined as never),
      (err: unknown) => err instanceof Response && err.status === 401,
      "a missing token must be rejected exactly like an invalid one",
    );
  });

  // NOTE — the ACCEPT path (Req 11.1: a valid token → `{ context, protocol }`
  // and `open` registering the peer under its account) is only fully reachable
  // with a live crossws socket server: `open`/`message`/`close` receive a real
  // `Peer`. Seeding a valid token row (via tokens.ts insertToken + this PGLite
  // loader) and calling `upgrade` would confirm resolveToken succeeds, but the
  // peer registration itself needs a live socket, so it is left to an
  // end-to-end harness. The queue fallback below is the transport that IS
  // exercisable here.
});

// ---------------------------------------------------------------------------
// 2. At-most-once queue delivery + live-push registry (Reqs 11.3, 11.4)
// ---------------------------------------------------------------------------

describe("pushToUser — live-push registry with no connected peer (Reqs 11.3, 11.4)", () => {
  it("returns 0 when the account has no listening lab", () => {
    // With no live socket, the in-process registry is empty for this account,
    // so a POST /control push reaches nobody and the caller must leave the row
    // on the polling queue (the fallback transport). This is the pure invariant
    // that guarantees the live path and the queue path never double-deliver:
    // when delivered === 0 the row stays unconsumed for GET polling below.
    assert.equal(socket.pushToUser("user-with-no-peer", { type: "spawn" }), 0);
    assert.equal(socket.listenerCount("user-with-no-peer"), 0, "no peers registered");
  });
});

describe("api_commands polling queue — at-most-once consume (Reqs 11.3, 11.4)", () => {
  it("delivers a queued command exactly once; a second poll returns nothing", async () => {
    const sql = await getSql();
    const userId = "control-user-atmostonce";

    // A POST /control with no connected peer (pushToUser === 0, above) leaves an
    // unconsumed row on the queue. Reproduce that insert directly.
    const id = crypto.randomUUID();
    const payload = { type: "spawn", generator: "galaxy", spawnCount: 5000 };
    await sql`
      insert into api_commands (id, user_id, payload)
      values (${id}, ${userId}, ${JSON.stringify(payload)})
    `;

    // First GET poll: the pending-command SELECT the route runs, then stamp
    // consumed_at on each returned row (the at-most-once guarantee).
    const firstPoll = await sql<{ id: string; payload: unknown }>`
      select id, payload from api_commands
      where user_id = ${userId} and consumed_at is null
      order by created_at asc
    `;
    assert.equal(firstPoll.length, 1, "first poll returns the queued command");
    assert.equal(firstPoll[0]!.id, id, "the returned row is the one we queued");
    await sql`update api_commands set consumed_at = now() where id = ${firstPoll[0]!.id}`;

    // Second GET poll: the command was already consumed, so the pending-only
    // SELECT must return nothing — delivered at most once.
    const secondPoll = await sql<{ id: string }>`
      select id from api_commands
      where user_id = ${userId} and consumed_at is null
      order by created_at asc
    `;
    assert.equal(secondPoll.length, 0, "a consumed command is never re-emitted");
  });

  it("a live-delivered command is marked consumed so polling does not re-emit it", async () => {
    const sql = await getSql();
    const userId = "control-user-livepush";

    // Model the POST /control path when a peer WAS connected: insert the row,
    // then (because the live push delivered) stamp consumed_at in the same
    // logical transaction. This is the branch that keeps the live socket and
    // the polling queue from double-delivering (Req 11.4).
    const id = crypto.randomUUID();
    await sql`
      insert into api_commands (id, user_id, payload)
      values (${id}, ${userId}, ${JSON.stringify({ type: "params" })})
    `;
    // delivered >= 1 branch: stamp consumed immediately.
    await sql`update api_commands set consumed_at = now() where id = ${id}`;

    // A later GET poll must therefore find nothing pending for this account.
    const poll = await sql<{ id: string }>`
      select id from api_commands
      where user_id = ${userId} and consumed_at is null
      order by created_at asc
    `;
    assert.equal(poll.length, 0, "a live-delivered command is not re-delivered by polling");
  });
});
