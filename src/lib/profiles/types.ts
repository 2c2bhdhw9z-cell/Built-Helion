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

/** Validates a public-profile read (the creator's user id / share handle). */
export const publicProfileSchema = z.object({
  userId: z.string().min(1),
});

export type PublicProfileInput = z.infer<typeof publicProfileSchema>;

/**
 * A single earned achievement badge, PII-free: the stable id plus a
 * human-readable label from the static definition table. No grant timestamp is
 * exposed on the public path.
 */
export interface PublicBadge {
  id: string;
  label: string;
}

/**
 * A public creation card on a creator's profile gallery. PII-free — only what
 * is needed to show and load the creation.
 */
export interface PublicGalleryItem {
  id: string;
  name: string;
  likeCount: number;
}

/**
 * The PUBLIC creator-profile bundle (Item 8). Everything a visitor needs to see
 * a creator's public page and NOTHING private: display name / bio / avatar hue,
 * their PUBLIC creations gallery, aggregate stats, and earned achievement
 * badges. It deliberately OMITS email and any private creations. `found` is
 * false for an unknown creator so the route can degrade gracefully.
 */
export interface PublicProfile {
  found: boolean;
  userId: string;
  displayName: string;
  bio: string;
  hue: number;
  /** Total PUBLIC creations by this creator. */
  publicCount: number;
  /** Total likes received across this creator's PUBLIC creations. */
  totalLikes: number;
  gallery: PublicGalleryItem[];
  badges: PublicBadge[];
}
