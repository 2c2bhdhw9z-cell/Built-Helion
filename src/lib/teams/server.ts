import { getSql } from "@/lib/db";
import { normalizeCreationConfig, type CreationConfig, type LibraryItem } from "@/lib/creations/types";
import type { TeamRole, TeamRow } from "./types";

const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomJoinCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ALPH[b % ALPH.length];
  return out;
}

type RawTeam = {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
  role: string;
  created_at: string | Date;
};

function toTeam(row: RawTeam): TeamRow {
  const role: TeamRole = row.role === "owner" || row.role === "view" ? row.role : "edit";
  return {
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    ownerId: row.owner_id,
    role,
    createdAt: row.created_at,
  };
}

export async function createTeam(userId: string, name: string): Promise<TeamRow> {
  const sql = await getSql();
  const id = crypto.randomUUID();
  const joinCode = randomJoinCode();
  await sql`
    insert into teams (id, name, join_code, owner_id)
    values (${id}, ${name}, ${joinCode}, ${userId})
  `;
  await sql`
    insert into team_members (team_id, user_id, role)
    values (${id}, ${userId}, ${"owner"})
  `;
  return {
    id,
    name,
    joinCode,
    ownerId: userId,
    role: "owner",
    createdAt: new Date().toISOString(),
  };
}

export async function joinTeam(userId: string, code: string): Promise<TeamRow | null> {
  const sql = await getSql();
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const rows = await sql<{ id: string; name: string; join_code: string; owner_id: string; created_at: string | Date }>`
    select id, name, join_code, owner_id, created_at from teams where join_code = ${normalized}
  `;
  const team = rows[0];
  if (!team) return null;
  await sql`
    insert into team_members (team_id, user_id, role)
    values (${team.id}, ${userId}, ${"edit"})
    on conflict (team_id, user_id) do nothing
  `;
  return {
    id: team.id,
    name: team.name,
    joinCode: team.join_code,
    ownerId: team.owner_id,
    role: team.owner_id === userId ? "owner" : "edit",
    createdAt: team.created_at,
  };
}

export async function listMyTeams(userId: string): Promise<TeamRow[]> {
  const sql = await getSql();
  const rows = await sql<RawTeam>`
    select t.id, t.name, t.join_code, t.owner_id, m.role, t.created_at
    from team_members m
    join teams t on t.id = m.team_id
    where m.user_id = ${userId}
    order by t.created_at desc
  `;
  return rows.map(toTeam);
}

export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from team_members where team_id = ${teamId} and user_id = ${userId}
  `;
  return rows.length > 0;
}

export async function shareToTeam(
  userId: string,
  teamId: string,
  name: string,
  config: CreationConfig,
): Promise<boolean> {
  if (!(await isTeamMember(userId, teamId))) return false;
  const sql = await getSql();
  const id = crypto.randomUUID();
  await sql`
    insert into creations (id, user_id, name, config, team_id)
    values (${id}, ${userId}, ${name}, ${JSON.stringify(config)}, ${teamId})
  `;
  return true;
}

export async function listTeamLibrary(userId: string, teamId: string): Promise<LibraryItem[]> {
  if (!(await isTeamMember(userId, teamId))) return [];
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    config: unknown;
    created_at: string | Date;
    author: string | null;
  }>`
    select c.id, c.name, c.config, c.created_at,
      coalesce(nullif(p.display_name, ''), 'Helion') as author
    from creations c
    left join profiles p on p.user_id = c.user_id
    where c.team_id = ${teamId}
    order by c.created_at desc
    limit 48
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    config: normalizeCreationConfig(row.config) ?? normalizeCreationConfig({})!,
    created_at: row.created_at,
    author: (row.author && row.author.trim()) || "Helion",
    likeCount: 0,
    liked: false,
  }));
}
