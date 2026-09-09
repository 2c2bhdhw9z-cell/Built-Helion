import { getSql } from "@/lib/db";
import { normalizeCreationConfig } from "@/lib/creations/types";
import { rankRows } from "@/lib/leaderboard/server";
import {
  dayKey,
  seedForDate,
  type DailyBoardEntry,
  type DailyChallenge,
} from "./types.ts";

/**
 * Server-only data layer for the daily challenge (Item 7). Imports getSql()
 * (which throws in the browser), so this module must NEVER be imported by
 * client code — the server functions in functions.ts import it dynamically
 * inside their handlers, matching the creations/feedback pattern.
 */

/**
 * The synthetic account that OWNS every seed-of-the-day creation. It is not a
 * real sign-in — just a stable owner id so the seed creation is a genuine,
 * loadable, public `creations` row that entries can fork from via the batch-A
 * `parent_id` lineage. Never rendered as an author (the board projects only
 * entry authors), so no PII concern.
 */
const DAILY_SEED_USER = "helion-daily-seed";

type ChallengeRow = {
  day: string;
  title: string;
  config: unknown;
  seed_creation_id: string;
};

function titleForDay(day: string): string {
  return `Daily Challenge — ${day}`;
}

/**
 * Return today's (or the given day's) challenge, lazily materializing it if it
 * does not exist yet (no cron needed). The seed CONFIG is the pure, deterministic
 * {@link seedForDate}; the row also records a real, public `creations` row
 * (`seed_creation_id`) so entries fork from a loadable source.
 *
 * The read + create is best-effort concurrency-safe: two racing first-requests
 * both `insert ... on conflict (day) do nothing`, then re-read, so at most one
 * seed row and one seed creation win. Public + unauthed — anyone may view.
 */
export async function getOrCreateChallenge(
  when: Date | string = new Date(),
): Promise<DailyChallenge> {
  const sql = await getSql();
  const day = dayKey(when);

  const existing = await sql<ChallengeRow>`
    select day, title, config, seed_creation_id from daily_challenges where day = ${day}
  `;
  const found = existing[0];
  if (found) {
    const config = normalizeCreationConfig(found.config);
    if (config) {
      return {
        day: found.day,
        title: found.title || titleForDay(day),
        config,
        seedCreationId: found.seed_creation_id,
      };
    }
    // A corrupt stored config falls through to re-materialize from the pure
    // generator against the SAME recorded seed creation id.
    return {
      day,
      title: found.title || titleForDay(day),
      config: seedForDate(day),
      seedCreationId: found.seed_creation_id,
    };
  }

  const config = seedForDate(day);
  const title = titleForDay(day);
  // A stable, deterministic seed-creation id per day so re-runs (and the racing
  // insert below) converge on the same public creation instead of orphaning
  // duplicates.
  const seedCreationId = `daily-seed-${day}`;

  // Materialize the real, public seed creation (idempotent).
  await sql`
    insert into creations (id, user_id, name, config, is_public, updated_at)
    values (${seedCreationId}, ${DAILY_SEED_USER}, ${title}, ${JSON.stringify(config)}, true, now())
    on conflict (id) do update set is_public = true
  `;

  await sql`
    insert into daily_challenges (day, title, config, seed_creation_id)
    values (${day}, ${title}, ${JSON.stringify(config)}, ${seedCreationId})
    on conflict (day) do nothing
  `;

  // Re-read so a racing insert's winning row is what we return.
  const settled = await sql<ChallengeRow>`
    select day, title, config, seed_creation_id from daily_challenges where day = ${day}
  `;
  const row = settled[0];
  const settledConfig = row ? normalizeCreationConfig(row.config) : null;
  return {
    day,
    title: row?.title || title,
    config: settledConfig ?? config,
    seedCreationId: row?.seed_creation_id ?? seedCreationId,
  };
}

type BoardRow = {
  id: string;
  name: string;
  config: unknown;
  author: string | null;
  like_count: string | number;
  user_id: string;
};

function authorLabel(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  return t || "No name";
}

/**
 * The ranked board for a day's challenge (Item 7): the PUBLIC creations forked
 * from that day's seed (its children via `parent_id`), ordered by like count
 * desc. Private children are excluded (the `c.is_public = true` filter), so an
 * un-published remix never appears. PII-free — only a display name is projected,
 * never an email.
 *
 * Ranking reuses the leaderboard's pure {@link rankRows} helper (score desc,
 * userId-asc stable tiebreak): each entry's `score` is its like count, so the
 * board matches the global-leaderboard ordering discipline.
 */
export async function listChallengeBoard(
  when: Date | string = new Date(),
): Promise<DailyBoardEntry[]> {
  const sql = await getSql();
  const day = dayKey(when);
  const seedCreationId = `daily-seed-${day}`;

  const rows = await sql<BoardRow>`
    select c.id, c.name, c.config, c.user_id,
      coalesce(nullif(p.display_name, ''), '') as author,
      (select count(*) from creation_likes l where l.creation_id = c.id) as like_count
    from creations c
    left join profiles p on p.user_id = c.user_id
    where c.parent_id = ${seedCreationId} and c.is_public = true
  `;

  // Rank by like count using the shared pure ranker (score desc, id-asc tie).
  const ranked = rankRows(
    rows.map((row) => ({
      userId: row.id,
      score: typeof row.like_count === "number" ? row.like_count : Number(row.like_count) || 0,
    })),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const entries: DailyBoardEntry[] = [];
  for (const r of ranked) {
    const row = byId.get(r.userId);
    if (!row) continue;
    const config = normalizeCreationConfig(row.config);
    if (!config) continue;
    entries.push({
      id: row.id,
      name: row.name,
      author: authorLabel(row.author),
      likeCount: r.score,
      config,
    });
  }
  return entries;
}
