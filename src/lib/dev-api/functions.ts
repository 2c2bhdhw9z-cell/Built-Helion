import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { DeliveryRow, TokenRow } from "./tokens";

export type { DeliveryRow, TokenRow };

export const createTokenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ name: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ row: TokenRow; raw: string }> => {
    const { insertToken } = await import("./tokens.ts");
    return insertToken(context.userId, data.name);
  });

export const listTokensFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TokenRow[]> => {
    const { listTokens } = await import("./tokens.ts");
    return listTokens(context.userId);
  });

export const revokeTokenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { revokeToken } = await import("./tokens.ts");
    return { ok: await revokeToken(context.userId, data.id) };
  });

export const listWebhooksFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ id: string; url: string }[]> => {
    const { listWebhookUrls } = await import("./tokens.ts");
    return listWebhookUrls(context.userId);
  });

export const addWebhookFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({ url: z.string().url().max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; url: string }> => {
    const { insertWebhook } = await import("./tokens.ts");
    return insertWebhook(context.userId, data.url);
  });

export const deleteWebhookFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { deleteWebhook } = await import("./tokens.ts");
    return { ok: await deleteWebhook(context.userId, data.id) };
  });

export const listDeliveriesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DeliveryRow[]> => {
    const { listDeliveries } = await import("./tokens.ts");
    try {
      return await listDeliveries(context.userId);
    } catch {
      return [];
    }
  });
