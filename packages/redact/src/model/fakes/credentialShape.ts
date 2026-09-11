// What part of a credential is FORMAT — the part a fake keeps. Pure functions over the
// string; the faker (`credentials.ts`) does the redrawing.

/** A word-like segment: letters, at most two digits, no longer than eight — `sk`, `live`,
 *  `github`, `pat`, `xoxb`, `glpat`, `v1`, `SG`. Eight hex characters are not a word. */
const SEGMENT = /^[A-Za-z][A-Za-z0-9]{0,7}(?=[_.-])/;
const TWO_DIGITS_AT_MOST = (seg: string) => (seg.match(/[0-9]/g) ?? []).length <= 2;
/** Vendors that put NO separator after their mark — the short list the shape cannot see. */
const BARE = /^(?:AKIA|ASIA|ABIA|ACCA|A3T[A-Z0-9]|AIza|dapi|GR1348941)/;
/** A scheme word before a space: `Bearer <token>`, `ssh-rsa AAAA…`. */
const SCHEME = /^(?:Bearer|Basic|Token|ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+)\s+/i;

/**
 * How many leading characters are a vendor's PREFIX: a run of word-like segments each ended
 * by `_`, `-` or `.`, capped at sixteen characters so a long dotted identifier never counts
 * as one. `0` when the value opens on its secret directly.
 */
/** The length of a scheme word and its space (`Bearer `, `ssh-rsa `), 0 without one. The
 *  header and prefix rules then read what FOLLOWS it — a JWT behind `Bearer ` is still a JWT. */
export function schemeLength(value: string): number {
  return SCHEME.exec(value)?.[0].length ?? 0;
}

export function wordPrefix(value: string): number {
  const bare = BARE.exec(value);
  if (bare) return bare[0].length;
  let at = 0;
  while (at < 16) {
    const m = SEGMENT.exec(value.slice(at));
    if (!m || !TWO_DIGITS_AT_MOST(m[0])) break;
    at += m[0].length + 1; // the segment and its separator
  }
  // `ssh-rsa AAAA`: the base64 preamble that spells the key type is format too.
  if (at === 0 && /^AAAA[B-Z]/.test(value)) return 4;
  return at;
}

/** A JWT's HEADER segment (`eyJ…` = base64url of `{"…`) up to and including its dot — the
 *  same bytes for every token an issuer signs, so nothing of the secret is in it. */
export function keepBase64Header(value: string): number | undefined {
  const m = /^eyJ[A-Za-z0-9_-]+\./.exec(value);
  return m && value.split(".").length >= 3 ? m[0].length : undefined;
}
