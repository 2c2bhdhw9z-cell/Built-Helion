import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  publicProfileSchema,
  updateProfileSchema,
  type Profile,
  type PublicProfile,
} from "./types.ts";

export const getProfileFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Profile> => {
    const { getProfile } = await import("./server.ts");
    return getProfile(context.userId);
  });

/**
 * PUBLIC creator-profile read (Item 8). Unauthenticated on purpose — anyone can
 * view a creator's public page, no login required (the hard no-forced-login
 * rule). The returned bundle is PII-free (display name / bio / hue, public
 * creations only, aggregate stats, earned badges) and NEVER an email or any
 * private creation. An unknown creator returns `found: false` so the route
 * degrades gracefully. The server-only ./server.ts is imported dynamically to
 * keep getSql() out of the client bundle.
 */
export const getPublicProfileFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => publicProfileSchema.parse(input))
  .handler(async ({ data }): Promise<PublicProfile> => {
    const { getPublicProfile } = await import("./server.ts");
    return getPublicProfile(data.userId);
  });

export const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => updateProfileSchema.parse(input))
  .handler(async ({ data, context }): Promise<Profile> => {
    const { assertNotSuspended } = await import("@/lib/admin/guard.server.ts");
    await assertNotSuspended(context.userId);
    const { upsertProfile } = await import("./server.ts");
    return upsertProfile(context.userId, data);
  });
