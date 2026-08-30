import { timingSafeEqual } from "node:crypto";

/**
 * Server-only authorization for the feedback ADMIN surface (list + status
 * update). This module imports nothing client-safe by accident and must never
 * reach the browser bundle — the feedback server functions import it
 * dynamically inside their handlers, next to `./server.ts`.
 *
 * WHY A DEDICATED MECHANISM (not just `authMiddleware`):
 * This app's supported standalone deploy may run with NO configured sign-in
 * (see README "Authentication" + .env.example — no federated broker; this app
 * is self-hosted Better Auth). `authMiddleware`/`requireUserId`
 * FAIL CLOSED when `DATABASE_URL` is set but auth is off, so wiring the admin
 * route through it would reject the legitimate owner too, making the admin view
 * unusable on the exact deploy that most needs it. So we support two
 * independent, server-verified mechanisms and fail closed on a real deploy when
 * neither is configured:
 *
 *   1. FEEDBACK_ADMIN_TOKEN  — a shared secret. The admin opens
 *      `/admin/feedback?token=<value>`; the route forwards it to the server
 *      functions, which compare it here in constant time. Works in the no-auth
 *      standalone deploy (set it in Vercel → Environment Variables).
 *   2. ADMIN_EMAILS          — a comma-separated allowlist checked against the
 *      VERIFIED session email (only meaningful when real sign-in is wired up).
 *
 * LOCAL DEV / TEST: when there is NO `DATABASE_URL` (embedded PGLite) AND
 * neither mechanism is configured, access is allowed so the PGLite dev/test
 * round trip keeps working with zero config. The moment a real database is
 * attached (`DATABASE_URL` set) the route fails closed unless an admin
 * mechanism is configured — protecting submitter PII on public deploys.
 *
 * This never fabricates data: an unauthorized caller is rejected (the server
 * functions turn that into an empty list / forbidden error), never a mock row.
 */

/** Thrown when an admin feedback call is not authorized. Carries `status: 403`. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** True when a real database is configured server-side. */
function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Pure parser for a comma-separated ADMIN_EMAILS value: splits on commas,
 * trims, lower-cases, and drops blank entries. Dependency-free and does not
 * read the environment, so it is directly unit-testable.
 */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Parsed, lower-cased ADMIN_EMAILS allowlist (empty when unset). */
export function adminEmailAllowlist(): string[] {
  return parseAdminEmails(env("ADMIN_EMAILS"));
}

/** Constant-time string compare that tolerates length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a compare to keep timing uniform, then fail.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export type AdminAuthInputs = {
  /** Shared secret supplied by the admin (query param / header), if any. */
  token?: string | null;
  /** Session email, if real sign-in is wired up, else null. */
  sessionEmail?: string | null;
  /**
   * Whether the session email is VERIFIED. The email allowlist mechanism only
   * grants admin to a verified address — an allowlisted-but-unverified email
   * must NOT authorize (defends against a spoofable/unconfirmed address).
   */
  sessionEmailVerified?: boolean;
};

/**
 * Pure decision function — no I/O, no request access — so it is unit-testable.
 * `hasDatabase`, `adminToken`, and `emails` are read from the environment by
 * `assertAdmin`; here they are explicit for testing.
 */
export function isAuthorizedAdmin(
  inputs: AdminAuthInputs,
  config: {
    hasDatabase: boolean;
    adminToken?: string;
    emails: string[];
  },
): boolean {
  const { adminToken, emails, hasDatabase } = config;

  // Mechanism 1: shared admin token.
  if (adminToken) {
    if (inputs.token && safeEqual(inputs.token, adminToken)) return true;
  }

  // Mechanism 2: verified-session email allowlist. Only a VERIFIED allowlisted
  // email authorizes — an unverified address is rejected even if allowlisted.
  if (emails.length > 0) {
    const email = inputs.sessionEmail?.trim().toLowerCase();
    if (email && inputs.sessionEmailVerified === true && emails.includes(email)) {
      return true;
    }
  }

  // No mechanism configured at all: allow ONLY on the local no-database
  // (embedded PGLite) dev/test path. A real database means a real deploy → deny.
  if (!adminToken && emails.length === 0) {
    return !hasDatabase;
  }

  // A mechanism is configured but the caller didn't satisfy it → deny.
  return false;
}

/**
 * Authorize an admin feedback call, or throw `ForbiddenError`. Reads the two
 * mechanisms from the environment and resolves the verified session email
 * (when sign-in is actually configured) itself, so callers only pass the
 * client-supplied token.
 */
export async function assertAdmin(token?: string | null): Promise<void> {
  const adminToken = env("FEEDBACK_ADMIN_TOKEN");
  const emails = adminEmailAllowlist();

  let sessionEmail: string | null = null;
  let sessionEmailVerified = false;
  if (emails.length > 0) {
    // Only bother resolving the session when an email allowlist is in play.
    try {
      const { getSessionUser } = await import("@/lib/auth/verify.server");
      const user = await getSessionUser();
      sessionEmail = user?.email ?? null;
      sessionEmailVerified = user?.emailVerified ?? false;
    } catch {
      sessionEmail = null;
      sessionEmailVerified = false;
    }
  }

  const ok = isAuthorizedAdmin(
    { token, sessionEmail, sessionEmailVerified },
    { hasDatabase: databaseConfigured(), adminToken, emails },
  );
  if (!ok) throw new ForbiddenError();
}
