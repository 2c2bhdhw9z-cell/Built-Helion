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

export async function fireWebhooks(
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await listWebhookUrls(userId);
  if (hooks.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    hooks.map((hook) =>
      fetch(hook.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(3000),
      }).catch(() => {}),
    ),
  );
}
