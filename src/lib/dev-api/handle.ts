import { saveCreationSchema } from "@/lib/creations/types";
import { resolveToken } from "./tokens";
import { allowV1 } from "./rate-limit";
import { writeAudit } from "@/lib/audit/server";
import { getSql } from "@/lib/db";
import { attachControlSocket, pushToUser } from "./socket";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

async function requireToken(request: Request) {
  const raw = bearer(request);
  if (!raw) return null;
  return resolveToken(raw);
}

/**
 * REST surface at /api/v1/*. Token auth (Bearer hl_…). Cookie sessions are
 * not accepted — this is for scripts and the JS/Python helpers.
 */
export async function handleV1(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");

  // WebSocket control channel (Req 11.1/11.2). A `new WebSocket()` upgrade
  // arrives here as a GET carrying `Upgrade: websocket`. We attach the
  // control-channel hooks (auth + peer registry live in ./socket.ts) so
  // crossws' default resolver reads them back off the request after this
  // handler returns and performs the 101 upgrade. Auth is enforced inside the
  // hooks' `upgrade` step, so no bearer check is needed here.
  //
  // Host-capability assumption (Req 11.4): this relies on the runtime
  // supporting a socket upgrade via crossws. On hosts without socket-upgrade
  // support the returned 426 is inert (no peer ever connects) and clients fall
  // back to the `api_commands` polling queue below — the queue stays the
  // transport and remains at-most-once.
  if (
    path === "control/socket" &&
    request.method === "GET" &&
    request.headers.get("upgrade")?.toLowerCase() === "websocket"
  ) {
    attachControlSocket(request);
    return new Response(null, {
      status: 426,
      statusText: "Upgrade Required",
      headers: { ...CORS, upgrade: "websocket", connection: "Upgrade" },
    });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!allowV1(ip)) return json(429, { error: "Slow down" });

  if (request.method === "GET" && (path === "" || path === "meta")) {
    return json(200, {
      name: "Helion API",
      version: 1,
      endpoints: {
        "GET /api/v1/library": "Public community library (empty until someone publishes)",
        "GET /api/v1/leaderboard": "Public global leaderboard of top creators (no auth)",
        "GET /api/v1/creations": "Your saved creations (Bearer)",
        "POST /api/v1/creations": "Save a scene { name, config }",
        "GET /api/v1/creations/:id": "Load a creation you own (Bearer) or a public one",
        "DELETE /api/v1/creations/:id": "Delete a creation you own (Bearer)",
        "GET /api/v1/history": "Your named checkpoints (Bearer)",
        "GET /api/v1/teams": "Teams you belong to (Bearer)",
        "GET /api/v1/usage": "Account usage totals (Bearer)",
        "GET /api/v1/webhooks/deliveries": "Last webhook deliveries (Bearer)",
        "POST /api/v1/control": "Queue a command { type: spawn|params, ... } for a listening lab",
        "GET /api/v1/control": "Pop pending commands (Bearer)",
        "GET /api/v1/control/socket": "WebSocket control channel; bearer token via sec-websocket-protocol (falls back to the polling queue)",
        "GET /sdk/helion.js": "JS helper",
        "GET /sdk/helion.py": "Python helper",
      },
      notes:
        "No FFmpeg farm, no multi-GPU, no headless GPU. A WebSocket control channel is available at /api/v1/control/socket when the host supports socket upgrades; where it does not, the polling command queue (POST/GET /api/v1/control) is the fallback transport and delivers each command at most once. Empty lists are empty — nothing is seeded.",
    });
  }

  if (request.method === "GET" && path === "library") {
    const { listLibrary } = await import("@/lib/creations/server");
    const sort = url.searchParams.get("sort") === "featured" ? "featured" : "recent";
    const items = await listLibrary(sort, null);
    return json(200, { items });
  }

  if (request.method === "GET" && path === "leaderboard") {
    const { listLeaderboard } = await import("@/lib/leaderboard/server");
    const raw = url.searchParams.get("limit");
    const parsed = raw === null ? undefined : Number.parseInt(raw, 10);
    const limit = typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
    const items = await listLeaderboard(limit);
    return json(200, { items });
  }

  if (path === "creations" && request.method === "GET") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    const { listCreations } = await import("@/lib/creations/server");
    const items = await listCreations(auth.userId);
    return json(200, { items });
  }

  if (path === "creations" && request.method === "POST") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json(400, { error: "JSON body required" });
    }
    const parsed = saveCreationSchema.safeParse(payload);
    if (!parsed.success) return json(400, { error: "Invalid scene", details: parsed.error.flatten() });
    const { insertCreation } = await import("@/lib/creations/server");
    const row = await insertCreation(auth.userId, parsed.data.name, parsed.data.config);
    const { fireWebhooks } = await import("./tokens");
    void fireWebhooks(auth.userId, { event: "creation.saved", id: row.id, name: row.name });
    void writeAudit(auth.userId, "creation.save", row.name);
    return json(201, { id: row.id, name: row.name });
  }

  if (path === "history" && request.method === "GET") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; created_at: string | Date }>`
      select id, name, created_at from version_history
      where user_id = ${auth.userId} and team_id is null
      order by created_at desc
      limit 40
    `;
    return json(200, {
      items: rows.map((r) => ({ id: r.id, name: r.name, at: r.created_at })),
    });
  }

  if (path === "teams" && request.method === "GET") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    const { listMyTeams } = await import("@/lib/teams/server");
    const items = await listMyTeams(auth.userId);
    return json(200, { items });
  }

  if (path === "usage" && request.method === "GET") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    try {
      const { readAccountUsage } = await import("@/lib/usage/server");
      const usage = await readAccountUsage(auth.userId);
      return json(200, usage);
    } catch {
      return json(200, { seconds: 0, spawns: 0, exports: 0, peak: 0, generators: {} });
    }
  }

  if (path === "webhooks/deliveries" && request.method === "GET") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    try {
      const { listDeliveries } = await import("./tokens");
      const items = await listDeliveries(auth.userId);
      return json(200, { items });
    } catch {
      return json(200, { items: [] });
    }
  }

  if (path === "control" && request.method === "POST") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json(400, { error: "JSON body required" });
    }
    if (!payload || typeof payload !== "object") return json(400, { error: "Object required" });
    const sql = await getSql();
    const id = crypto.randomUUID();
    await sql`insert into api_commands (id, user_id, payload) values (${id}, ${auth.userId}, ${JSON.stringify(payload)})`;
    // Live delivery over the WebSocket control channel (Req 11.3). If at least
    // one listening lab received the command, immediately stamp `consumed_at`
    // so the GET polling fallback will not re-emit it — the live push and the
    // queue never double-deliver (at-most-once, Req 11.4). If no peer is
    // connected (returns 0), leave the row unconsumed so polling delivers it.
    const delivered = pushToUser(auth.userId, payload);
    if (delivered >= 1) {
      await sql`update api_commands set consumed_at = now() where id = ${id}`;
    }
    void writeAudit(auth.userId, "api.control", delivered >= 1 ? "delivered" : "queued");
    return json(202, { id, delivered });
  }

  if (path === "control" && request.method === "GET") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    const sql = await getSql();
    const rows = await sql<{ id: string; payload: unknown }>`
      select id, payload from api_commands
      where user_id = ${auth.userId} and consumed_at is null
      order by created_at asc
      limit 20
    `;
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      for (const id of ids) {
        await sql`update api_commands set consumed_at = now() where id = ${id}`;
      }
    }
    return json(200, { commands: rows });
  }

  const creationMatch = /^creations\/([a-zA-Z0-9_-]+)$/.exec(path);
  if (creationMatch && request.method === "GET") {
    const id = creationMatch[1]!;
    const auth = await requireToken(request);
    if (auth) {
      const { getOwnedCreation } = await import("@/lib/creations/server");
      const owned = await getOwnedCreation(auth.userId, id);
      if (owned) return json(200, owned);
    }
    const { getPublicCreation } = await import("@/lib/creations/server");
    const row = await getPublicCreation(id);
    if (!row) return json(404, { error: "Not found" });
    return json(200, row);
  }

  if (creationMatch && request.method === "DELETE") {
    const auth = await requireToken(request);
    if (!auth) return json(401, { error: "Bearer token required" });
    const { deleteCreation } = await import("@/lib/creations/server");
    const deleted = await deleteCreation(auth.userId, creationMatch[1]!);
    return json(deleted ? 200 : 404, { deleted });
  }

  return json(404, { error: "Unknown endpoint" });
}
