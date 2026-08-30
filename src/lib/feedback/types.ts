import { z } from "zod";

/**
 * Client-safe feedback types + zod schemas. This file MUST stay free of any
 * server-only imports (no @/lib/db, no server.ts) so both the browser bundle
 * and the server functions can import it.
 */

/** Kind of feedback a user can submit. */
export type FeedbackType = "bug" | "feature" | "general";

/** Lifecycle status of a submission, controlled by the admin. */
export type FeedbackStatus =
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed"
  | "declined";

export const feedbackTypes: readonly FeedbackType[] = [
  "bug",
  "feature",
  "general",
];

export const feedbackStatuses: readonly FeedbackStatus[] = [
  "under_review",
  "planned",
  "in_progress",
  "completed",
  "declined",
];

/**
 * A feedback row as stored in and returned from Postgres. Field names are
 * snake_case to match the table columns.
 *
 * `created_at` is a `timestamptz` column. The pg/PGLite drivers parse that OID
 * into a JS `Date` (db.ts only string-normalizes the plain `date` OID, not
 * timestamptz), so the runtime value is a `Date` on the server and, once
 * serialized across the server-function boundary, an ISO `string` on the
 * client. Typed `string | Date` so both shapes are honest; consumers should
 * coerce (see `formatCreatedAt` in the admin route).
 */
export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  category: string | null;
  description: string;
  steps_or_use_cases: string | null;
  severity_or_priority: string | null;
  rating: number | null;
  votes: number;
  status: FeedbackStatus;
  user_email: string | null;
  created_at: string | Date;
}

/** Validates a new feedback submission (the full field set). */
export const submitFeedbackSchema = z.object({
  type: z.enum(["bug", "feature", "general"]),
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().optional(),
  description: z.string().trim().min(1, "Description is required"),
  stepsOrUseCases: z.string().trim().optional(),
  severityOrPriority: z.string().trim().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  userEmail: z.string().trim().email().optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

/**
 * The admin surface (list + status update) is authorized server-side. The
 * caller may forward a shared admin token (see FEEDBACK_ADMIN_TOKEN in
 * admin-auth.server.ts); it is optional here because authorization can instead
 * come from a verified-session email allowlist or the local no-database dev
 * path. Never trust this token client-side — it is only ever validated on the
 * server.
 */
export const adminAccessSchema = z.object({
  token: z.string().optional(),
});

export type AdminAccessInput = z.infer<typeof adminAccessSchema>;

/** Validates an admin status change for an existing submission. */
export const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    "under_review",
    "planned",
    "in_progress",
    "completed",
    "declined",
  ]),
  /** Optional shared admin token, validated server-side. */
  token: z.string().optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
