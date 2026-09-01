/**
 * The per-conversation key the fake generators draw from.
 *
 * 32 CSPRNG bytes, hex. It replaces the additive salt as the secret in the value→fake
 * mapping: with it every seed is `HMAC-SHA256(key, category ‖ value)`, so one known
 * (value, fake) pair says nothing about any other value — which an additive shift over a
 * public hash could never claim (`@openmasq/redact` `model/fakes/keyedMapping.test.ts`).
 *
 * It lives here rather than in `sendOrchestrator.ts` because that file is frozen debt: new
 * code lands in a sibling module (rule 1).
 */
export function mintRedactionKey(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
