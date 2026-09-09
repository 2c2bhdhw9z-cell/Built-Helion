import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { ApiUsageDay, DeliveryRow, TokenRow } from "./tokens";

export type { ApiUsageDay, DeliveryRow, TokenRow };

/** The developer usage/quota view (Item 19): the current rate-limit window
 * state plus the trailing per-day request counts, all owner-scoped. */
export type UsageView = {
  quota: { used: number; limit: number; windowMs: number; resetMs: number };
  daily: ApiUsageDay[];
};

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

// Re-export so the developer page (and validators) can share the exact same
// SSRF predicate the server enforces, rather than duplicating the rule.
export { isAllowedWebhookUrl } from "./webhook-url.ts";

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

/**
 * Fire a TEST delivery to one of the caller's OWN registered webhooks (Item 20).
 * Authed + owner-scoped: `testWebhook` looks the webhook up filtered by the
 * authenticated user's id, so a foreign id resolves to `null` (returned as
 * `{ ok: false }`) and no request is made. The delivery is recorded in
 * `webhook_deliveries` so it shows in the deliveries list like a real event.
 */
export const testWebhookFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; delivery: DeliveryRow | null }> => {
    const { testWebhook } = await import("./tokens.ts");
    try {
      const delivery = await testWebhook(context.userId, data.id);
      return { ok: delivery !== null, delivery };
    } catch {
      return { ok: false, delivery: null };
    }
  });

/**
 * The developer usage/quota view (Item 19): the caller's CURRENT rate-limit
 * window state (60/60s, read-only — never increments the counter) plus the
 * trailing per-day API request counts for the usage chart. Owner-scoped by the
 * authenticated user id; aggregate counts only, no PII.
 */
export const getUsageViewFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<UsageView> => {
    const { readApiUsageDaily } = await import("./tokens.ts");
    const { readV1Quota, userRateLimitKey } = await import("./rate-limit.ts");
    const [quota, daily] = await Promise.all([
      // Read the SAME bucket `handleV1` enforces for an authenticated request:
      // the per-account key `user:<userId>` (see `userRateLimitKey`). This makes
      // the "used / limit" number on the developer page equal to the counter
      // that actually throttles that developer's API calls.
      readV1Quota(userRateLimitKey(context.userId)).catch(() => ({
        used: 0,
        limit: 60,
        windowMs: 60_000,
        resetMs: 0,
      })),
      readApiUsageDaily(context.userId).catch(() => []),
    ]);
    return { quota, daily };
  });
