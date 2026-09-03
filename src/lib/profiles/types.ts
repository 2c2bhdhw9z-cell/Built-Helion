import { z } from "zod";

export type Profile = {
  displayName: string;
  bio: string;
  hue: number;
  saves: number;
  likes: number;
};

export const DEFAULT_PROFILE: Profile = {
  displayName: "",
  bio: "",
  hue: 168,
  saves: 0,
  likes: 0,
};

export const updateProfileSchema = z.object({
  displayName: z.string().trim().max(40),
  bio: z.string().trim().max(160),
  hue: z.number().int().min(0).max(360),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
