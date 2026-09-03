import { saveCreationSchema } from "@/lib/creations/types";
import { resolveToken } from "./tokens";
import { allowV1 } from "./rate-limit";
import { writeAudit } from "@/lib/audit/server";
import { getSql } from "@/lib/db";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
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
 * not accepted — this is for scripts and the JS/Python snippets.
 */
export async function handleV1(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!allowV1(ip)) return json(429, { error: "Slow down" });

  if (request.method === "GET" && (path === "" || path === "meta")) {
    return json(200, {
      name: "Helion API",
      version: 1,
      endpoints: {
        "GET /api/v1/library": "Public community library",
        "GET /api/v1/creations": "Your saved creations (Bearer token)",
        "POST /api/v1/creations": "Save a scene { name, config }",
        "GET /api/v1/creations/:id": "Load a creation by id",
        "POST /api/v1/control": "Queue a command { type: spawn|params, ... } for a listening lab",
        "GET /api/v1/control": "Pop pending commands (Bearer)",
        "GET /sdk/helion.js": "JS helper",
        "GET /sdk/helion.py": "Python helper",
      },
      notes: "No FFmpeg farm, no multi-GPU, no headless GPU, no WebSocket on this host. Control is a command queue.",
    });
  }

  if (request.method === "GET" && path === "library") {
    const { listLibrary } = await import("@/lib/creations/server");
    const sort = url.searchParams.get("sort") === "featured" ? "featured" : "recent";
    const items = await listLibrary(sort, null);
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
    void writeAudit(auth.userId, "api.control", "queued");
    return json(202, { id });
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
    const { getPublicCreation } = await import("@/lib/creations/server");
    const row = await getPublicCreation(creationMatch[1]!);
    if (!row) return json(404, { error: "Not found" });
    return json(200, row);
  }

  return json(404, { error: "Unknown endpoint" });
}
