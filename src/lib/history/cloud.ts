import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { normalizeCreationConfig, type CreationConfig } from "@/lib/creations/types";
import { writeAudit } from "@/lib/audit/server";

export type CloudVersion = {
  id: string;
  name: string;
  at: number;
  config: CreationConfig;
};

export const pushCloudVersionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ name: z.string().trim().min(1).max(80), config: z.unknown() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CloudVersion> => {
    const config = normalizeCreationConfig(data.config);
    if (!config) throw new Error("Invalid scene");
    const sql = await getSql();
    const id = crypto.randomUUID();
    const rows = await sql<{ created_at: string | Date }>`
      insert into version_history (id, user_id, name, config)
      values (${id}, ${context.userId}, ${data.name}, ${JSON.stringify(config)})
      returning created_at
    `;
    await writeAudit(context.userId, "history.save", data.name);
    const at = new Date(rows[0]?.created_at ?? Date.now()).getTime();
    return { id, name: data.name, at, config };
  });

export const listCloudVersionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CloudVersion[]> => {
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; config: unknown; created_at: string | Date }>`
      select id, name, config, created_at from version_history
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
    const out: CloudVersion[] = [];
    for (const r of rows) {
      const config = normalizeCreationConfig(r.config);
      if (!config) continue;
      out.push({
        id: r.id,
        name: r.name,
        at: new Date(r.created_at).getTime(),
        config,
      });
    }
    return out;
  });

export const deleteCloudVersionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ deleted: boolean }> => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      delete from version_history where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    return { deleted: rows.length > 0 };
  });
