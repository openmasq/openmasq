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

/** A URI SCHEME and its `://` (`postgres://`, `mongodb+srv://`, `jdbc:postgresql://`). It
 *  names the KIND of endpoint — what an agent routes on — and it is public: the secret in a
 *  connection string is the credential and the host that follow it. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*(?::[A-Za-z0-9+.-]+)?:\/\//;

export function wordPrefix(value: string): number {
  const uri = URI_SCHEME.exec(value);
  if (uri) return uri[0].length;
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

/** One unbroken run, long, with letters AND digits: a credential, not prose. The test the
 *  scheme word does not already answer — `Saint-Germain-en-Laye` segments exactly like a
 *  vendor prefix and is a PLACE, so the prefix shape alone may never decide this. */
const CREDENTIAL_LIKE = /^(?=.*[A-Za-z])(?=.*\d)\S{16,}$/;

/**
 * How much of `value` is FORMAT rather than secret — `0` for anything that is prose.
 *
 * The faker keeps this head verbatim (`credentials.ts`), which makes it identical for every
 * credential a vendor issues: one `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.` per issuer, one
 * `sk_live_` per Stripe account, one `Bearer ` per scheme. So it carries NO identity, and
 * whoever reasons about a fake word by word (`pseudonymize/fakeWordIndex.ts`) must not read
 * it as one. Asked HERE because this file is the one home of that question.
 */
export function formatHead(value: string): number {
  const scheme = schemeLength(value);
  const rest = value.slice(scheme);
  const header = keepBase64Header(rest);
  if (header !== undefined) return scheme + header; // a JWT, whatever its tail looks like
  if (scheme > 0) return scheme; // `Bearer …`, `ssh-rsa …`: the scheme word IS the signal
  return CREDENTIAL_LIKE.test(rest) ? wordPrefix(rest) : 0;
}
