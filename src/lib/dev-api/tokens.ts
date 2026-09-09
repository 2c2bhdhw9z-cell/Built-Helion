import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string | Date;
  lastUsedAt: string | Date | null;
};

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintRawToken(): { raw: string; prefix: string; hash: string } {
  const raw = `hl_${randomBytes(24).toString("hex")}`;
  return { raw, prefix: raw.slice(0, 10), hash: hashToken(raw) };
}

export async function insertToken(
  userId: string,
  name: string,
): Promise<{ row: TokenRow; raw: string }> {
  const sql = await getSql();
  const minted = mintRawToken();
  const id = crypto.randomUUID();
  const rows = await sql<{ created_at: string | Date }>`
    insert into api_tokens (id, user_id, name, prefix, hash)
    values (${id}, ${userId}, ${name}, ${minted.prefix}, ${minted.hash})
    returning created_at
  `;
  return {
    raw: minted.raw,
    row: {
      id,
      name,
      prefix: minted.prefix,
      createdAt: rows[0]?.created_at ?? new Date().toISOString(),
      lastUsedAt: null,
    },
  };
}

export async function listTokens(userId: string): Promise<TokenRow[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    prefix: string;
    created_at: string | Date;
    last_used_at: string | Date | null;
  }>`
    select id, name, prefix, created_at, last_used_at
    from api_tokens
    where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

export async function revokeToken(userId: string, id: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from api_tokens where id = ${id} and user_id = ${userId} returning id
  `;
  return rows.length > 0;
}

export async function resolveToken(
  raw: string,
): Promise<{ userId: string; tokenId: string } | null> {
  if (!raw || !raw.startsWith("hl_")) return null;
  const sql = await getSql();
  const hash = hashToken(raw);
  const rows = await sql<{ id: string; user_id: string }>`
    select id, user_id from api_tokens where hash = ${hash}
  `;
  const row = rows[0];
  if (!row) return null;
  await sql`update api_tokens set last_used_at = now() where id = ${row.id}`;
  return { userId: row.user_id, tokenId: row.id };
}

export async function listWebhookUrls(userId: string): Promise<{ id: string; url: string }[]> {
  const sql = await getSql();
  return sql<{ id: string; url: string }>`
    select id, url from webhooks where user_id = ${userId} order by created_at desc
  `;
}

export async function insertWebhook(userId: string, url: string): Promise<{ id: string; url: string }> {
  const sql = await getSql();
  const id = crypto.randomUUID();
  await sql`insert into webhooks (id, user_id, url) values (${id}, ${userId}, ${url})`;
  return { id, url };
}

export async function deleteWebhook(userId: string, id: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from webhooks where id = ${id} and user_id = ${userId} returning id
  `;
  return rows.length > 0;
}

export type DeliveryRow = {
  id: string;
  webhookId: string;
  event: string;
  ok: boolean;
  status: number | null;
  attempts: number;
  at: string | Date;
};

export async function listDeliveries(userId: string): Promise<DeliveryRow[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    webhook_id: string;
    event: string;
    ok: boolean | number | string;
    status: number | null;
    attempts: number;
    created_at: string | Date;
  }>`
    select id, webhook_id, event, ok, status, attempts, created_at
    from webhook_deliveries
    where user_id = ${userId}
    order by created_at desc
    limit 20
  `;
  return rows.map((r) => ({
    id: r.id,
    webhookId: r.webhook_id,
    event: r.event,
    ok: r.ok === true || r.ok === "t" || r.ok === "true" || r.ok === 1,
    status: r.status == null ? null : Number(r.status),
    attempts: Number(r.attempts) || 1,
    at: r.created_at,
  }));
}

async function recordDelivery(
  userId: string,
  webhookId: string,
  event: string,
  ok: boolean,
  status: number | null,
  attempts: number,
): Promise<void> {
  try {
    const sql = await getSql();
    await sql`
      insert into webhook_deliveries (id, webhook_id, user_id, event, ok, status, attempts)
      values (
        ${crypto.randomUUID()},
        ${webhookId},
        ${userId},
        ${event.slice(0, 80)},
        ${ok},
        ${status},
        ${attempts}
      )
    `;
  } catch {
    /* table may not exist yet */
  }
}

/**
 * A single day's API request count for the developer usage chart (Item 19).
 * `day` is a 'YYYY-MM-DD' string (the db layer normalizes DATE to text on both
 * backends). Aggregate count only — no request bodies, no PII.
 */
export type ApiUsageDay = { day: string; count: number };

/**
 * Increment the caller's per-day API request counter (Item 19). Called once per
 * authenticated /api/v1 request from the handler. Best-effort: the table may
 * not exist on an un-migrated deploy, and a counter bump must never fail an API
 * request, so any error is swallowed. `day` is derived server-side as the UTC
 * calendar day so the rollup is stable regardless of client timezone.
 */
export async function bumpApiUsageDaily(userId: string, at: Date = new Date()): Promise<void> {
  const day = at.toISOString().slice(0, 10);
  try {
    const sql = await getSql();
    await sql`
      insert into api_usage_daily (user_id, day, count)
      values (${userId}, ${day}, 1)
      on conflict (user_id, day)
      do update set count = api_usage_daily.count + 1
    `;
  } catch {
    /* table may not exist yet, or DB blip — never fail the request */
  }
}

/**
 * Read the caller's API request counts for the trailing `days` calendar days
 * (Item 19), oldest→newest, zero-filled so the chart always shows a continuous
 * window even for days with no traffic. Owner-scoped: only the given user's
 * rows are read.
 */
export async function readApiUsageDaily(userId: string, days = 14): Promise<ApiUsageDay[]> {
  const window = Math.min(90, Math.max(1, Math.floor(days)));
  const byDay = new Map<string, number>();
  try {
    const sql = await getSql();
    const since = new Date(Date.now() - (window - 1) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const rows = await sql<{ day: string | Date; count: number | string }>`
      select day, count from api_usage_daily
      where user_id = ${userId} and day >= ${since}
      order by day asc
    `;
    for (const r of rows) {
      const key = typeof r.day === "string" ? r.day.slice(0, 10) : r.day.toISOString().slice(0, 10);
      byDay.set(key, Number(r.count) || 0);
    }
  } catch {
    /* table may not exist yet — fall through to a zero-filled window */
  }
  const out: ApiUsageDay[] = [];
  for (let i = window - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    out.push({ day, count: byDay.get(day) ?? 0 });
  }
  return out;
}

/**
 * POST a JSON payload to one webhook URL and record the delivery, exactly like
 * a real event delivery: 3s timeout, one retry on failure, and the ok/status/
 * attempts result written to `webhook_deliveries` so it shows up in the list.
 * This is the shared delivery primitive used by both `fireWebhooks` (event
 * fan-out) and `testWebhook` (Item 20's manual "Test" action) so a test
 * delivery is indistinguishable from a real one on the wire and in the log.
 */
async function deliverWebhook(
  userId: string,
  hook: { id: string; url: string },
  event: string,
  body: string,
): Promise<{ ok: boolean; status: number | null; attempts: number }> {
  const send = () =>
    fetch(hook.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(3000),
    });
  let attempts = 1;
  let ok = false;
  let status: number | null = null;
  try {
    const res = await send();
    status = res.status;
    ok = res.ok;
  } catch {
    ok = false;
  }
  if (!ok) {
    attempts = 2;
    try {
      const res = await send();
      status = res.status;
      ok = res.ok;
    } catch {
      ok = false;
    }
  }
  await recordDelivery(userId, hook.id, event, ok, status, attempts);
  return { ok, status, attempts };
}

export async function fireWebhooks(
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await listWebhookUrls(userId);
  if (hooks.length === 0) return;
  const event = typeof payload.event === "string" ? payload.event : "event";
  const body = JSON.stringify(payload);
  await Promise.all(hooks.map((hook) => deliverWebhook(userId, hook, event, body)));
}

/**
 * Fire a TEST delivery to one of the caller's OWN registered webhooks (Item 20).
 * OWNER-SCOPED: the webhook id is looked up filtered by `user_id`, so a user can
 * only test a webhook they registered — a foreign id resolves to `null` and no
 * request is made. This introduces NO new SSRF surface beyond `fireWebhooks`,
 * which already POSTs to these same user-supplied URLs on real events; the only
 * difference is the trigger (a manual button vs. an event). The delivery is
 * recorded in `webhook_deliveries` exactly like a real one so it appears in the
 * deliveries list with its ok/status/attempts.
 */
export async function testWebhook(
  userId: string,
  webhookId: string,
): Promise<DeliveryRow | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; url: string }>`
    select id, url from webhooks where id = ${webhookId} and user_id = ${userId}
  `;
  const hook = rows[0];
  if (!hook) return null;
  const event = "test.ping";
  const body = JSON.stringify({
    event,
    test: true,
    message: "Helion test webhook delivery",
    at: new Date().toISOString(),
  });
  const result = await deliverWebhook(userId, hook, event, body);
  return {
    id: crypto.randomUUID(),
    webhookId: hook.id,
    event,
    ok: result.ok,
    status: result.status,
    attempts: result.attempts,
    at: new Date().toISOString(),
  };
}
