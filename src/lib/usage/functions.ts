import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { emptyUsage, type UsageStats } from "@/lib/play/analytics";

const deltaSchema = z.object({
  seconds: z.number().finite().min(0).max(86_400),
  spawns: z.number().finite().min(0).max(1_000_000),
  exports: z.number().finite().min(0).max(10_000),
  peak: z.number().finite().min(0).max(2_000_000),
  generators: z.record(z.string(), z.number()).default({}),
});

export const getUsageFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<UsageStats> => {
    const { readAccountUsage } = await import("./server.ts");
    try {
      return await readAccountUsage(context.userId);
    } catch {
      return emptyUsage();
    }
  });

export const flushUsageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => deltaSchema.parse(input))
  .handler(async ({ data, context }): Promise<UsageStats> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { mergeAccountUsage } = await import("./server.ts");
    return mergeAccountUsage(context.userId, data);
  });
