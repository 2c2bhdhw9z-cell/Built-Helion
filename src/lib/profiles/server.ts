import { getSql } from "@/lib/db";
import {
  DEFAULT_PROFILE,
  type Profile,
  type PublicBadge,
  type PublicGalleryItem,
  type PublicProfile,
  type UpdateProfileInput,
} from "./types.ts";

type ProfileRow = {
  display_name: string;
  bio: string;
  hue: number;
};

type StatRow = {
  saves: string | number;
  likes: string | number;
};

function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getProfile(userId: string): Promise<Profile> {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select display_name, bio, hue from profiles where user_id = ${userId}
  `;
  const stats = await sql<StatRow>`
    select
      (select count(*) from creations where user_id = ${userId}) as saves,
      (
        select count(*) from creation_likes l
        inner join creations c on c.id = l.creation_id
        where c.user_id = ${userId}
      ) as likes
  `;
  const row = rows[0];
  const st = stats[0];
  return {
    displayName: row?.display_name ?? DEFAULT_PROFILE.displayName,
    bio: row?.bio ?? DEFAULT_PROFILE.bio,
    hue: row?.hue ?? DEFAULT_PROFILE.hue,
    saves: num(st?.saves),
    likes: num(st?.likes),
  };
}

type GalleryRow = {
  id: string;
  name: string;
  like_count: string | number;
};

/**
 * Build the PUBLIC creator-profile bundle (Item 8): display name / bio / hue,
 * the creator's PUBLIC creations gallery, aggregate stats (public count + total
 * likes received), and earned achievement badges.
 *
 * PII-FREE by construction: it SELECTs only public columns (never `user_email`
 * or any auth field), and the gallery query filters to `is_public = true` so a
 * private creation can never appear. An unknown creator (no profile row AND no
 * public creations) yields `found: false` with empty data, so the public route
 * degrades gracefully instead of hard-erroring.
 *
 * Achievement badges reuse the static, public-safe `ACHIEVEMENTS` definition
 * table (stable id + human label) joined against the account's granted rows;
 * the private grant timestamp is not exposed.
 */
export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const sql = await getSql();

  const profileRows = await sql<ProfileRow>`
    select display_name, bio, hue from profiles where user_id = ${userId}
  `;
  const profile = profileRows[0];

  const galleryRows = await sql<GalleryRow>`
    select c.id, c.name,
      (select count(*) from creation_likes l where l.creation_id = c.id) as like_count
    from creations c
    where c.user_id = ${userId} and c.is_public = true
    order by like_count desc, c.created_at desc
    limit 48
  `;
  const gallery: PublicGalleryItem[] = galleryRows.map((row) => ({
    id: row.id,
    name: row.name,
    likeCount: num(row.like_count),
  }));

  const totalRows = await sql<{ public_count: string | number; total_likes: string | number }>`
    select
      (select count(*) from creations where user_id = ${userId} and is_public = true) as public_count,
      (
        select count(*) from creation_likes l
        inner join creations c on c.id = l.creation_id
        where c.user_id = ${userId} and c.is_public = true
      ) as total_likes
  `;
  const totals = totalRows[0];

  // Earned achievement badges: join the account's granted ids to the static,
  // public-safe definition table for their labels. No grant timestamp exposed.
  const grantedRows = await sql<{ achievement_id: string }>`
    select achievement_id from achievements where user_id = ${userId}
  `;
  const { ACHIEVEMENTS } = await import("@/lib/achievements/server");
  const labelById = new Map(ACHIEVEMENTS.map((def) => [def.id, def.label]));
  const badges: PublicBadge[] = grantedRows
    .map((row): PublicBadge | null => {
      const label = labelById.get(row.achievement_id);
      return label ? { id: row.achievement_id, label } : null;
    })
    .filter((b): b is PublicBadge => b !== null);

  const publicCount = num(totals?.public_count);
  const found = Boolean(profile) || publicCount > 0;

  return {
    found,
    userId,
    displayName: profile?.display_name ?? DEFAULT_PROFILE.displayName,
    bio: profile?.bio ?? DEFAULT_PROFILE.bio,
    hue: profile?.hue ?? DEFAULT_PROFILE.hue,
    publicCount,
    totalLikes: num(totals?.total_likes),
    gallery,
    badges,
  };
}

export async function upsertProfile(
  userId: string,
  patch: UpdateProfileInput,
): Promise<Profile> {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, display_name, bio, hue, updated_at)
    values (${userId}, ${patch.displayName}, ${patch.bio}, ${patch.hue}, now())
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      bio = excluded.bio,
      hue = excluded.hue,
      updated_at = now()
  `;
  return getProfile(userId);
}
