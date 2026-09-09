import { z } from "zod";

/**
 * Client-safe comments model + zod schemas (Item 9). This file MUST stay free
 * of any server-only imports (no @/lib/db, no server.ts) so the browser bundle,
 * the comments UI, and the server functions can all import it. All DB access
 * lives in ./server.ts, imported dynamically inside the server-fn handlers.
 *
 * Comments attach to PUBLIC creations only (mirroring the toggleLike public-only
 * rule) and are moderated with the same shape as feedback: a public projection
 * that never includes PII, a posting throttle, and admin hide/delete.
 */

/** Max comment body length — long enough for a real note, capped against abuse. */
export const COMMENT_BODY_MAX = 500;

/**
 * A PUBLIC comment as shown to any viewer. PII-FREE: the author is a display
 * name (or "No name"), NEVER an email or the raw account id. Hidden comments are
 * excluded from this projection for non-admins.
 */
export interface PublicComment {
  id: string;
  creationId: string;
  author: string;
  body: string;
  createdAt: string | Date;
}

/**
 * An admin/moderation view of a comment — adds the `hidden` flag and the author
 * id so a moderator can act on it. Still no email (the schema never stores one).
 */
export interface AdminComment extends PublicComment {
  userId: string;
  hidden: boolean;
}

/** Validates posting a comment: the target creation id + a length-capped body. */
export const postCommentSchema = z.object({
  creationId: z.string().min(1),
  body: z.string().trim().min(1, "Comment is empty").max(COMMENT_BODY_MAX),
});

export type PostCommentInput = z.infer<typeof postCommentSchema>;

/** Validates listing comments for a creation (public, PII-free). */
export const listCommentsSchema = z.object({
  creationId: z.string().min(1),
});

export type ListCommentsInput = z.infer<typeof listCommentsSchema>;

/**
 * Validates an admin moderation action (hide or delete). Carries the comment id
 * and the optional admin token forwarded from the URL, exactly like the
 * feedback admin fns.
 */
export const moderateCommentSchema = z.object({
  id: z.string().min(1),
  token: z.string().optional(),
});

export type ModerateCommentInput = z.infer<typeof moderateCommentSchema>;

/** Validates the hide/unhide action: the moderate fields plus a `hidden` flag. */
export const hideCommentSchema = moderateCommentSchema.extend({
  hidden: z.boolean(),
});

export type HideCommentInput = z.infer<typeof hideCommentSchema>;

/** Validates the admin list request (optional token). */
export const adminListCommentsSchema = z.object({
  token: z.string().optional(),
});
