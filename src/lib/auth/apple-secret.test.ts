import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt, decodeProtectedHeader, exportPKCS8, generateKeyPair } from "jose";
import { generateAppleClientSecret } from "./apple-secret.server.ts";

// The apple-secret helper imports only `jose` (a dependency that loads cleanly
// under `node --experimental-strip-types`), so it is safe to unit-test here
// without pulling in the server-only Better Auth instance / pg. We mint a token
// with a throwaway EC key and assert its header/payload match Apple's contract.

const APPLE_AUDIENCE = "https://appleid.apple.com";
const INPUT = {
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  clientId: "com.example.service",
};

async function makePrivateKeyPem(): Promise<string> {
  // ES256 uses the P-256 curve; `extractable: true` so we can export to PEM.
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  return exportPKCS8(privateKey);
}

describe("generateAppleClientSecret", () => {
  it("produces an ES256 JWT with the correct header (alg + kid)", async () => {
    const privateKey = await makePrivateKeyPem();
    const jwt = await generateAppleClientSecret({ ...INPUT, privateKey });
    const header = decodeProtectedHeader(jwt);
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, INPUT.keyId);
  });

  it("sets iss=teamId, aud=appleid, sub=clientId with an exp inside Apple's 6-month max", async () => {
    const privateKey = await makePrivateKeyPem();
    const jwt = await generateAppleClientSecret({ ...INPUT, privateKey });
    const payload = decodeJwt(jwt);
    assert.equal(payload.iss, INPUT.teamId);
    assert.equal(payload.aud, APPLE_AUDIENCE);
    assert.equal(payload.sub, INPUT.clientId);
    assert.equal(typeof payload.iat, "number");
    assert.equal(typeof payload.exp, "number");
    // exp must be in the future and within Apple's hard 6-month (15777000s) cap.
    const now = Math.floor(Date.now() / 1000);
    assert.ok((payload.exp as number) > now, "exp must be in the future");
    assert.ok(
      (payload.exp as number) - (payload.iat as number) <= 15777000,
      "lifetime must not exceed Apple's 6-month maximum",
    );
  });

  it("accepts a private key stored with literal \\n sequences (Vercel-style)", async () => {
    const pem = await makePrivateKeyPem();
    // Simulate a Vercel env var that flattened the PEM to a single line.
    const flattened = pem.replace(/\n/g, "\\n");
    const jwt = await generateAppleClientSecret({
      ...INPUT,
      privateKey: flattened,
    });
    const header = decodeProtectedHeader(jwt);
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, INPUT.keyId);
  });
});
