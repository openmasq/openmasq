// Atomic fake identity for EMAILS — one half of the `identity/` family (see `index.ts`).
// A real person's address must keep ONE stable fake everywhere, and the fake's local-part
// carries a greetable fake first/last name that must reverse to the REAL person.
// Pure + deterministic (no vault mutation here — the caller owns the vault).
import { FAKE_LAST, FAKE_EMAIL_DOMAINS, fakeToken, hashString, firstNamePool } from "../fakes";
import { capitalize, foldAccents } from "../../util";
// The shared "not a person" mailbox vocabulary + the notorious-domain predicate — one
// home for both (`../notoriousDomains.ts`), shared with the notoriety filter.
import { GENERIC_MAILBOX, isNotoriousDomain } from "../notorious/domains";
// The detection-grade first-name lexicon (curated + INSEE tail), pure data.
import { FIRST_NAMES } from "../../engine/names/firstNames.data";
import { seedFrom } from "../fakes/primitives";

const isNameToken = (t: string) =>
  /^[A-Za-zÀ-ÿ]{3,}$/.test(t) && !GENERIC_MAILBOX.has(t.toLowerCase());

/**
 * ⚠️ A local-part is treated as a PERSON only when its FIRST token is a KNOWN given name —
 * the burden of proof is inverted on purpose: a NAME alias minted for `notifications@`
 * would re-redact that ordinary word conversation-wide. A missed alias costs a fake first
 * name in a greeting; a wrong one corrupts a vocabulary word everywhere. Non-personal
 * local-parts are shape-scrambled (still faked).
 */
const isGivenName = (t: string) =>
  isNameToken(t) && FIRST_NAMES.has(foldAccents(t).toLowerCase());

/** The person test on the SPLIT local-part: a known given name up front, or a lone
 *  INITIAL (one letter) followed by a name-shaped token (`j.sabourdin@`). */
const isPersonalLocal = (toks: string[]): boolean => {
  const first = toks[0] ?? "";
  if (isGivenName(first)) return true;
  return /^[A-Za-zÀ-ÿ]$/.test(first) && toks.slice(1).some(isNameToken);
};

const emailLocalPart = (email: string) => {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(0, at) : "";
};

const emailDomainPart = (email: string) => {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
};

/**
 * A faked EMAIL's local-part carries a fake first/last name, and a model writing TO it
 * greets "Bonjour Nathan" — a bare token that is NOT a vault key. Derive reversible ALIASES
 * (`Nathan → Julien`) by aligning fake and real name tokens positionally; the caller
 * registers them. Generic mailboxes yield no NAME alias. The **domain** is ALSO aliased
 * (`mail.com → gmail.com`): identifying, and the model can lift it out on its own. Returns
 * `[fakeAlias, realValue]` pairs (capitalised + lowercase per token, one for the domain).
 */
export function emailNameAliases(realEmail: string, fakeEmail: string): [string, string][] {
  const realToks = emailLocalPart(realEmail).split(/[._+-]+/).filter(Boolean);
  const fakeToks = emailLocalPart(fakeEmail).split(/[._+-]+/).filter(Boolean);
  const out: [string, string][] = [];
  // A generic mailbox written WITH a separator (`no-reply`) splits into fragments that dodge
  // the per-token check — test the separator-stripped local-part too. NAME aliases only for
  // a PERSON (`isGivenName`), the same gate as `buildFakeEmail`.
  if (isPersonalLocal(realToks) && !GENERIC_MAILBOX.has(realToks.join("").toLowerCase())) {
    const n = Math.min(realToks.length, fakeToks.length);
    for (let i = 0; i < n; i++) {
      const real = realToks[i];
      const fake = fakeToks[i];
      if (!isNameToken(real) || !isNameToken(fake)) continue;
      if (fake.toLowerCase() === real.toLowerCase()) continue;
      out.push([capitalize(fake), capitalize(real)]); // "Nathan" -> "Julien" (greeting)
      out.push([fake.toLowerCase(), real.toLowerCase()]); // "nathan" -> "julien"
    }
  }
  // Domain after the `@`: alias the whole domain (`mail.com` -> `gmail.com`) when it
  // was actually changed, so a domain the model extracts on its own still reverses.
  const realDom = emailDomainPart(realEmail).toLowerCase();
  const fakeDom = emailDomainPart(fakeEmail).toLowerCase();
  if (realDom.includes(".") && fakeDom && fakeDom !== realDom) {
    out.push([fakeDom, realDom]);
  }
  return out;
}

/**
 * Build a fake email that keeps a person's fake identity STABLE across the conversation:
 * each name in the local-part AND the domain reuse their EXISTING canonical fake
 * (`resolveFake`); a FIRST-seen one gets a fresh pool pick avoiding `isTaken` and the real
 * value. Name fakes only for a PERSON ({@link isGivenName}); every other local-part is
 * shape-scrambled. With `keepKnownDomain` (commercial notoriety), a NOTORIOUS provider
 * domain is kept VERBATIM: `gmail.com` identifies nobody. Aliases come from
 * {@link emailNameAliases}. Deterministic given (realEmail, attempt).
 */
export function buildFakeEmail(
  realEmail: string,
  attempt: number,
  resolveFake: (real: string) => string | undefined,
  isTaken: (fake: string) => boolean,
  salt = 0,
  keepKnownDomain = false,
  convKey?: Uint8Array,
): string {
  const h = seedFrom(convKey, `email:${attempt}`, realEmail, hashString(realEmail) + salt + attempt * 101);
  const at = realEmail.lastIndexOf("@");
  const local = at > 0 ? realEmail.slice(0, at) : realEmail;
  const realDomain = at >= 0 ? realEmail.slice(at + 1) : ""; // bare, e.g. "gmail.com"
  const parts = local.split(/([._+-])/); // even index = token, odd = separator
  // PERSON gate — see `isPersonalLocal`: no known given name (or initial + surname)
  // up front ⇒ no name fakes at all, every token scrambles (and `emailNameAliases`
  // derives no name alias).
  const personal = isPersonalLocal(parts.filter((p, i) => i % 2 === 0 && !!p));
  let nameIdx = 0;
  const out = parts.map((part, i) => {
    if (i % 2 === 1 || !part) return part; // keep separators / empties verbatim
    if (!personal || !isNameToken(part)) return fakeToken(part, h + i); // generic/short/numeric
    let fakeCap = resolveFake(capitalize(part)); // reuse the person's canonical fake…
    if (!fakeCap) {
      // …else pick a fresh, un-taken pool name (first token → same-gender FIRST, rest → LAST).
      const pool = nameIdx === 0 ? firstNamePool(part) : FAKE_LAST;
      fakeCap = pool[(h + attempt) % pool.length];
      for (let k = 0; k < pool.length; k++) {
        const cand = pool[(h + attempt + k) % pool.length];
        // Test BOTH forms: what lands in the local part is the FOLDED form (`valere`), and
        // two people must not end up with the same address. Over-avoiding is the safe direction.
        const asMinted = foldAccents(cand.toLowerCase());
        if (cand.toLowerCase() === part.toLowerCase()) continue;
        if (isTaken(cand) || isTaken(asMinted)) continue;
        fakeCap = cand;
        break;
      }
    }
    nameIdx++;
    // Diacritics are FOLDED here, and only here: an accented local part is not an address
    // systems accept, and the first tool that normalises it produces a string that is no
    // longer a vault key. The DISPLAYED name keeps its accent (`buildFakeName`).
    return foldAccents(fakeCap.toLowerCase());
  });
  // Domain after the `@`: reuse this real domain's canonical fake; else, under the
  // commercial dispensation, KEEP a notorious provider/service domain verbatim (it
  // identifies nobody, and a swapped real domain poisons the vault — see the header);
  // else pick a fresh pool domain DIFFERENT from the real one (never leak it by a
  // same pick).
  let domain = realDomain ? resolveFake(realDomain) : undefined;
  if (!domain && keepKnownDomain && isNotoriousDomain(realDomain)) domain = realDomain;
  if (!domain) {
    // ONE fake domain per REAL domain — seeded on the domain, not the address or the
    // attempt: two colleagues at atelier-sud.fr must share a fake domain. Same TLD when the
    // pool has one, so a model asked for the extension answers the same.
    const pool = FAKE_EMAIL_DOMAINS.map((d) => d.replace(/^@/, "")); // bare domains
    const lower = realDomain.toLowerCase();
    const tld = lower.slice(lower.lastIndexOf("."));
    const sameTld = pool.filter((d) => d.endsWith(tld));
    const candidates = sameTld.length ? sameTld : pool;
    const dh = seedFrom(convKey, "email-domain", lower, hashString(lower) + salt);
    // Two REAL domains must never share a fake one ("how many domains?" would answer one
    // short): a fake already taken by another domain is skipped — `emailDomainPair` registers
    // every allocated domain, so `isTaken` sees it. Same TLD first, the whole pool next, and
    // when both are spent a scrambled label under the same extension, which is always free.
    domain = undefined;
    for (const list of [candidates, pool]) {
      for (let k = 0; k < list.length && !domain; k++) {
        const cand = list[(dh + k) % list.length];
        if (cand.toLowerCase() !== lower && !isTaken(cand)) domain = cand;
      }
    }
    if (!domain) {
      const label = lower.slice(0, lower.length - tld.length) || "mail";
      domain = `${fakeToken(label, dh).toLowerCase()}${tld}`;
    }
  }
  return `${out.join("")}@${domain}`;
}

/**
 * The domain pair beside an allocated email — `[fake domain, real domain]` — for the vault:
 * the next address at the same real domain then RESOLVES this fake instead of drawing one,
 * another real domain cannot draw it (it is taken), and the domain written alone in prose
 * masks to the same fake it wears inside the address. Null when the domain was kept
 * verbatim (a notorious provider) or the address has none.
 */
export function emailDomainPair(realEmail: string, fakeEmail: string): [string, string] | null {
  const r = realEmail.lastIndexOf("@");
  const f = fakeEmail.lastIndexOf("@");
  if (r < 0 || f < 0) return null;
  const real = realEmail.slice(r + 1);
  const fake = fakeEmail.slice(f + 1);
  if (!real || !fake || real.toLowerCase() === fake.toLowerCase()) return null;
  return [fake, real];
}
