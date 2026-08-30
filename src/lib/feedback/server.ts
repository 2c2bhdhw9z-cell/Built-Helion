import { getSql } from "@/lib/db";
import type {
  FeedbackItem,
  FeedbackStatus,
  SubmitFeedbackInput,
} from "./types.ts";

/**
 * Server-only DB access layer for feedback. Imports getSql() (which throws in
 * the browser), so this module must NEVER be imported by client code — the
 * server functions in functions.ts import it dynamically inside their handlers.
 *
 * All queries are parameterized via the sql tagged template. No mock/seeded
 * data: every row here comes from real submissions.
 */

/** Insert a new feedback row (id generated app-side) and return it. */
export async function insertFeedback(
  input: SubmitFeedbackInput,
): Promise<FeedbackItem> {
  const sql = await getSql();
  const id = crypto.randomUUID();
  const rows = await sql<FeedbackItem>`
    insert into feedback (
      id, type, title, category, description, steps_or_use_cases,
      severity_or_priority, rating, user_email
    ) values (
      ${id},
      ${input.type},
      ${input.title},
      ${input.category ?? null},
      ${input.description},
      ${input.stepsOrUseCases ?? null},
      ${input.severityOrPriority ?? null},
      ${input.rating ?? null},
      ${input.userEmail ?? null}
    )
    returning id, type, title, category, description, steps_or_use_cases,
      severity_or_priority, rating, votes, status, user_email, created_at
  `;
  return rows[0];
}

/** All feedback rows, newest first. */
export async function listFeedback(): Promise<FeedbackItem[]> {
  const sql = await getSql();
  return sql<FeedbackItem>`
    select id, type, title, category, description, steps_or_use_cases,
      severity_or_priority, rating, votes, status, user_email, created_at
    from feedback
    order by created_at desc
  `;
}

/** Update a submission's status; returns the updated row, or null if missing. */
export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackItem | null> {
  const sql = await getSql();
  const rows = await sql<FeedbackItem>`
    update feedback set status = ${status}
    where id = ${id}
    returning id, type, title, category, description, steps_or_use_cases,
      severity_or_priority, rating, votes, status, user_email, created_at
  `;
  return rows[0] ?? null;
}
