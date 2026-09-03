import { getSql } from "@/lib/db";
import { DEFAULT_PROFILE, type Profile, type UpdateProfileInput } from "./types.ts";

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
