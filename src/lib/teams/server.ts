import { getSql } from "@/lib/db";
import { normalizeCreationConfig, type CreationConfig, type LibraryItem } from "@/lib/creations/types";
import type { TeamMember, TeamRole, TeamRow } from "./types";

const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomJoinCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ALPH[b % ALPH.length];
  return out;
}

function authorLabel(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  return t || "No name";
}

type RawTeam = {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
  role: string;
  created_at: string | Date;
};

function toRole(role: string): TeamRole {
  if (role === "owner" || role === "view") return role;
  return "edit";
}

function toTeam(row: RawTeam): TeamRow {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    ownerId: row.owner_id,
    role: toRole(row.role),
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

async function memberRole(userId: string, teamId: string): Promise<TeamRole | null> {
  const sql = await getSql();
  const rows = await sql<{ role: string }>`
    select role from team_members where team_id = ${teamId} and user_id = ${userId}
  `;
  const role = rows[0]?.role;
  return role ? toRole(role) : null;
}

export async function listMembers(userId: string, teamId: string): Promise<TeamMember[]> {
  if (!(await isTeamMember(userId, teamId))) return [];
  const sql = await getSql();
  const rows = await sql<{ user_id: string; role: string; created_at: string | Date; name: string | null }>`
    select m.user_id, m.role, m.created_at, coalesce(nullif(p.display_name, ''), '') as name
    from team_members m
    left join profiles p on p.user_id = m.user_id
    where m.team_id = ${teamId}
    order by m.created_at asc
  `;
  return rows.map((row) => ({
    userId: row.user_id,
    name: authorLabel(row.name),
    role: toRole(row.role),
    joinedAt: row.created_at,
  }));
}

export async function setMemberRole(
  actorId: string,
  teamId: string,
  userId: string,
  role: "edit" | "view",
): Promise<boolean> {
  const sql = await getSql();
  const teams = await sql<{ owner_id: string }>`select owner_id from teams where id = ${teamId}`;
  if (teams[0]?.owner_id !== actorId) return false;
  if (userId === actorId) return false;
  const rows = await sql<{ user_id: string }>`
    update team_members set role = ${role}
    where team_id = ${teamId} and user_id = ${userId} and role <> 'owner'
    returning user_id
  `;
  return rows.length > 0;
}

export async function kickMember(actorId: string, teamId: string, userId: string): Promise<boolean> {
  const sql = await getSql();
  const teams = await sql<{ owner_id: string }>`select owner_id from teams where id = ${teamId}`;
  if (teams[0]?.owner_id !== actorId) return false;
  if (userId === actorId) return false;
  const rows = await sql<{ user_id: string }>`
    delete from team_members
    where team_id = ${teamId} and user_id = ${userId} and role <> 'owner'
    returning user_id
  `;
  return rows.length > 0;
}

export async function leaveTeam(userId: string, teamId: string): Promise<boolean> {
  const role = await memberRole(userId, teamId);
  if (!role) return false;
  if (role === "owner") return false;
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    delete from team_members where team_id = ${teamId} and user_id = ${userId} returning user_id
  `;
  return rows.length > 0;
}

export async function dissolveTeam(userId: string, teamId: string): Promise<boolean> {
  const sql = await getSql();
  const teams = await sql<{ id: string }>`
    select id from teams where id = ${teamId} and owner_id = ${userId}
  `;
  if (!teams[0]) return false;
  await sql`update creations set team_id = null where team_id = ${teamId}`;
  await sql`update version_history set team_id = null where team_id = ${teamId}`;
  await sql`delete from team_members where team_id = ${teamId}`;
  await sql`delete from teams where id = ${teamId}`;
  return true;
}

export async function renameTeam(userId: string, teamId: string, name: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update teams set name = ${name} where id = ${teamId} and owner_id = ${userId} returning id
  `;
  return rows.length > 0;
}

export async function shareToTeam(
  userId: string,
  teamId: string,
  name: string,
  config: CreationConfig,
): Promise<boolean> {
  const role = await memberRole(userId, teamId);
  if (!role || role === "view") return false;
  const sql = await getSql();
  const id = crypto.randomUUID();
  await sql`
    insert into creations (id, user_id, name, config, team_id)
    values (${id}, ${userId}, ${name}, ${JSON.stringify(config)}, ${teamId})
  `;
  try {
    await sql`
      insert into version_history (id, user_id, name, config, team_id)
      values (${crypto.randomUUID()}, ${userId}, ${name}, ${JSON.stringify(config)}, ${teamId})
    `;
  } catch {
    /* version_history.team_id may not exist on a stale process */
  }
  return true;
}

export async function deleteTeamScene(userId: string, teamId: string, id: string): Promise<boolean> {
  const role = await memberRole(userId, teamId);
  if (!role || role === "view") return false;
  const sql = await getSql();
  const rows =
    role === "owner"
      ? await sql<{ id: string }>`
          delete from creations where id = ${id} and team_id = ${teamId} returning id
        `
      : await sql<{ id: string }>`
          delete from creations where id = ${id} and team_id = ${teamId} and user_id = ${userId} returning id
        `;
  return rows.length > 0;
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
    user_id: string;
  }>`
    select c.id, c.name, c.config, c.created_at, c.user_id,
      coalesce(nullif(p.display_name, ''), '') as author
    from creations c
    left join profiles p on p.user_id = c.user_id
    where c.team_id = ${teamId}
    order by c.created_at desc
    limit 48
  `;
  const out: LibraryItem[] = [];
  for (const row of rows) {
    const config = normalizeCreationConfig(row.config);
    if (!config) continue;
    out.push({
      id: row.id,
      name: row.name,
      config,
      created_at: row.created_at,
      author: authorLabel(row.author),
      likeCount: 0,
      liked: false,
      ownerId: row.user_id,
    });
  }
  return out;
}
