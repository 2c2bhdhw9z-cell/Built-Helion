import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { choosePlanSchema, type BillingState } from "./types.ts";

export const getBillingFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BillingState> => {
    const { getOrCreateBilling } = await import("./server.ts");
    return getOrCreateBilling(context.userId);
  });

export const choosePlanFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => choosePlanSchema.parse(input))
  .handler(async ({ data, context }): Promise<BillingState> => {
    const { choosePlan } = await import("./server.ts");
    return choosePlan(context.userId, data.plan);
  });
