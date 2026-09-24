// A fake CREDENTIAL keeps the credential's FORMAT and nothing of its secret.
//
// What a model derives from a key is its VENDOR and its KIND — `sk_live_` is a Stripe live
// key, `ghp_` a GitHub PAT, `eyJ…` a JWT — and a coding agent acts on that: it writes the
// `startsWith`, routes on the prefix, decodes the header. `fakeToken`'s full scramble threw
// the prefix away with the secret, so the agent read `Ql2fp_9x…` where the code expected a
// Stripe key and reasoned about a broken value. This is the same rule as a phone keeping its
// country code and a card its network (`../CLAUDE.md`, "keep the DERIVED attribute").
//
// What is KEPT is never entropy: a vendor's public prefix, a JWT's header (base64 of
// `{"alg":…}`, the same for every token of that issuer), a cookie's NAME, the separators.
// What follows is redrawn character by character from the seed, class for class — a digit
// for a digit, upper for upper, lower for lower — so length and silhouette survive and no
// character of the real tail is reused (the output never reads the input: nothing to invert).
//
// ⚠️ The prefix is recognised by SHAPE, not by a second vendor table (`rules.tokens.ts` and
// `rules.vendors.ts` own those): a prefix is a run of short WORD-like segments ended by a
// separator. Word-like is the guard — `a3f9c7d2-` at the head of a UUID-shaped key is not a
// word, it is eight characters of the secret, and it is redrawn like the rest.
import { keepBase64Header, schemeLength, wordPrefix } from "./credentialShape";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = LOWER.toUpperCase();
const DIGIT = "0123456789";

/** Redraw every alphanumeric of `tail` in its own class; separators and punctuation stay. */
function redraw(tail: string, seed: number): string {
  let h = seed >>> 0;
  const next = (n: number) => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0), h % n);
  return Array.from(tail, (c) => {
    if (/[a-z]/.test(c)) return LOWER[next(26)] as string;
    if (/[A-Z]/.test(c)) return UPPER[next(26)] as string;
    if (/[0-9]/.test(c)) return DIGIT[next(10)] as string;
    return c;
  }).join("");
}

/** A cookie header value: `name=value; Path=/; HttpOnly`. The names and the attributes are
 *  the format; only a VALUE is secret. An attribute this list does not know is treated as a
 *  value — the safe way round. */
const COOKIE_ATTRS = new Set(["path", "domain", "expires", "max-age", "samesite", "priority", "secure", "httponly", "partitioned"]);
function fakeCookie(value: string, seed: number): string {
  let n = 0;
  return value
    .split(";")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq < 0) return part; // a flag: `HttpOnly`, `Secure`
      const name = part.slice(0, eq);
      if (COOKIE_ATTRS.has(name.trim().toLowerCase())) return part;
      return `${name}=${redraw(part.slice(eq + 1), (seed + 7919 * ++n) >>> 0)}`;
    })
    .join(";");
}

/**
 * The fake for anything credential-shaped: vendor keys, generic tokens, JWTs, cookies.
 * Deterministic for a seed (the vault decides the seed, as for every faker); the redrawn
 * tail is compared to the real one and redrawn once more in the astronomically unlikely
 * case it came back identical.
 */
export function fakeCredential(value: string, seed: number, category = ""): string {
  if (category === "COOKIE") return fakeCookie(value, seed);
  const scheme = schemeLength(value);
  const rest = value.slice(scheme);
  const kept = scheme + (keepBase64Header(rest) ?? wordPrefix(rest));
  const head = value.slice(0, kept);
  const tail = value.slice(kept);
  let fake = redraw(tail, seed);
  if (fake === tail && /[A-Za-z0-9]/.test(tail)) fake = redraw(tail, (seed + 1) >>> 0);
  return head + fake;
}
