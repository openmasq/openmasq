/**
 * The BUILD ATTESTATION placed on requests to the relay — extracted from `sink.ts`
 * because two paths now share it (events and flags), and it has
 * nothing to do with the transport itself.
 *
 * `HMAC-SHA256(appKey, "<ts>.<nonce>")` via Web Crypto, which avoids any crypto
 * library. ⚠️ **Anti-abuse, never an identity**: it authenticates the client BUILD,
 * not a user — so anonymity holds, and a request goes out just as well signed out.
 * The relay verifies then DISCARDS it. Honest limit: the key is extractable from a
 * shipped bundle, it's a bot filter, not a wall (rate limiting is the real safeguard).
 * Never on the direct PostHog path.
 */
// The package's only dependency: the brand's home — zero dep itself (a JSON +
// pure helpers), so the "browser globals only" rule holds in the popup, the
// isolated content-script and the renderer. The relay checks these header NAMES verbatim.
import { BRAND } from "@openmasq/branding";

/** Lowercase-hex of `bytes` random bytes (Web Crypto — a browser/Node global). */
export const randomHex = (bytes: number): string => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** `HMAC-SHA256(key, msg)` as lowercase hex, via Web Crypto (no crypto library needed). */
export const hmacHex = async (key: string, msg: string): Promise<string> => {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
};

/** The attestation headers, or `{}` with no key (the relay accepts when it isn't
 *  configured — dev) or if Web Crypto throws. Never rejects. */
export async function attestHeaders(appKey: string | undefined): Promise<Record<string, string>> {
  if (!appKey) return {};
  try {
    const ts = String(Date.now());
    const nonce = randomHex(16);
    const sig = await hmacHex(appKey, `${ts}.${nonce}`);
    const h = (suffix: string): string => `X-${BRAND.name}-${suffix}`;
    return { [h("Ts")]: ts, [h("Nonce")]: nonce, [h("Sig")]: sig };
  } catch {
    return {};
  }
}
