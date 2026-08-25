import { createHash, randomBytes } from "node:crypto";

/**
 * PKCE S256 helpers — shared by the desktop-direct OAuth flows (Google loopback,
 * Slack verifier-gated handoff). Pure; the gateway derives the SAME `challengeOf`
 * to bind a Slack token retrieval to the initiating desktop.
 */

/** base64url (no padding) of a buffer. */
export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh high-entropy verifier (32 random bytes). */
export const newVerifier = (): string => base64url(randomBytes(32));

/** The S256 challenge for a verifier: base64url(SHA256(verifier)). */
export const challengeOf = (verifier: string): string =>
  base64url(createHash("sha256").update(verifier).digest());
