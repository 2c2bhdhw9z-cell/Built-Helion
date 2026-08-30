/**
 * Apple "Sign in with Apple" client-secret JWT generator (server-only).
 *
 * Unlike Google/GitHub, Apple has NO static client secret to paste. Apple's
 * OAuth client secret is a short-lived ES256-signed JWT the app mints itself
 * from the developer's private key. Better Auth's apple provider treats
 * `clientSecret` as an opaque string (it does NOT sign this for you), so we
 * generate the JWT here and hand Better Auth the resulting string.
 *
 * DORMANT until credentials exist: this module is imported ONLY inside the
 * guarded `appleConfigured` block in `server.ts`, so it never loads (and `jose`
 * never runs) unless the owner has supplied the full Apple credential set. Apple
 * requires a paid Apple Developer account ($99/yr); until then Apple is off and
 * none of this code executes.
 *
 * The JWT shape Apple requires (https://developer.apple.com/documentation/
 * sign_in_with_apple/generate_and_validate_tokens):
 *   header  { alg: 'ES256', kid: <APPLE_KEY_ID> }
 *   payload { iss: <APPLE_TEAM_ID>, iat, exp (<= 6 months), aud:
 *             'https://appleid.apple.com', sub: <APPLE_CLIENT_ID> }
 * signed with the `.p8` private key (`APPLE_PRIVATE_KEY`).
 *
 * Server-only: uses `jose` (already a dependency). NEVER import from client code.
 */
import { SignJWT, importPKCS8 } from "jose";

/** Apple's OAuth token audience — fixed by Apple. */
const APPLE_AUDIENCE = "https://appleid.apple.com";

/**
 * Client-secret lifetime. Apple's hard maximum is 6 months (15777000s); we pick
 * a conservative 180-day window. The secret is minted fresh at module load
 * (i.e. per deploy / cold start), so a redeploy always issues a new, well
 * within-bounds token.
 */
const CLIENT_SECRET_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

export type AppleClientSecretInput = {
  /** Apple Team ID (JWT `iss`). */
  teamId: string;
  /** Apple Key ID for the `.p8` private key (JWT header `kid`). */
  keyId: string;
  /** Apple Services ID / client id (JWT `sub`). */
  clientId: string;
  /** The `.p8` private key contents (PKCS#8 PEM). May contain literal "\n". */
  privateKey: string;
};

/**
 * Vercel (and most env-var UIs) store a multi-line `.p8` key as a single line
 * with literal backslash-n sequences. `importPKCS8` needs REAL newlines in the
 * PEM, so normalize `\n` -> newline (and strip stray CRs) before importing.
 */
function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
}

/**
 * Build Apple's client-secret JWT: an ES256-signed token minted from the Team
 * ID, Key ID, Services ID (client id), and `.p8` private key. Returns the signed
 * compact JWT string to pass to Better Auth as the apple provider `clientSecret`.
 */
export async function generateAppleClientSecret({
  teamId,
  keyId,
  clientId,
  privateKey,
}: AppleClientSecretInput): Promise<string> {
  const key = await importPKCS8(normalizePrivateKey(privateKey), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + CLIENT_SECRET_TTL_SECONDS)
    .setAudience(APPLE_AUDIENCE)
    .setSubject(clientId)
    .sign(key);
}
