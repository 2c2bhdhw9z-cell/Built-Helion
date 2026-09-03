import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { updateProfileSchema, type Profile } from "./types.ts";

export const getProfileFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Profile> => {
    const { getProfile } = await import("./server.ts");
    return getProfile(context.userId);
  });

export const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => updateProfileSchema.parse(input))
  .handler(async ({ data, context }): Promise<Profile> => {
    const { upsertProfile } = await import("./server.ts");
    return upsertProfile(context.userId, data);
  });
