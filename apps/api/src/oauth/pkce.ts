import { createHash, randomBytes } from "node:crypto";

/**
 * PKCE (RFC 7636) — S256 only. The broker REFUSES the `plain` method and missing
 * challenges: a public client (no secret, the desktop loopback case) is only safe
 * with a proof-of-possession verifier.
 */

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The S256 challenge for a verifier: BASE64URL(SHA256(verifier)). */
export function s256Challenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/** A fresh high-entropy code_verifier (43 chars) — for the broker's upstream leg. */
export function createVerifier(): string {
  return base64url(randomBytes(32));
}

/** True iff `method` is the only one we accept. */
export function isS256(method: string | undefined): boolean {
  return method === "S256";
}

/**
 * Verify a code_verifier against a previously stored S256 challenge. Uses a
 * length check + constant-ish compare (the strings are short, fixed-shape).
 */
export function verifyPkce(verifier: string | undefined, challenge: string): boolean {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  const computed = s256Challenge(verifier);
  if (computed.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ challenge.charCodeAt(i);
  return diff === 0;
}
