// Atomic fake identity for EMAILS — one half of the `identity/` family (see `index.ts`).
// A real person's address must keep ONE stable fake everywhere, and the fake's local-part
// carries a greetable fake first/last name that must reverse to the REAL person.
// Pure + deterministic (no vault mutation here — the caller owns the vault).
import { FAKE_LAST, FAKE_EMAIL_DOMAINS, fakeToken, hashString, firstNamePool } from "../fakes";
import { capitalize, foldAccents } from "../../util";
// The shared "not a person" mailbox vocabulary + the notorious-domain predicate — one
// home for both (`../notoriousDomains.ts`), shared with the notoriety filter.
import { GENERIC_MAILBOX, isNotoriousDomain } from "../notoriousDomains";
// The detection-grade first-name lexicon (curated + INSEE tail), pure data.
import { FIRST_NAMES } from "../../engine/names/firstNames.data";
import { seedFrom } from "../fakes/primitives";

const isNameToken = (t: string) =>
  /^[A-Za-zÀ-ÿ]{3,}$/.test(t) && !GENERIC_MAILBOX.has(t.toLowerCase());

/**
 * ⚠️ A local-part is treated as a PERSON only when its FIRST token is a KNOWN given
 * name — the burden of proof is inverted on purpose. "Any ≥3-letter word outside a
 * 30-word list" minted a NAME fake + alias for `notifications@`, `security@`,
 * `estimation@`…, and a fake→"notifications" alias then re-redacted that ordinary
 * word conversation-wide (the reverse pass corrupting prose and URLs). The asymmetry
 * decides the gate: a missed alias costs a fake first name in a greeting; a wrong one
 * corrupts a vocabulary word everywhere. Non-personal local-parts are shape-scrambled
 * instead (still faked — never shipped in clear by THIS gate).
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
 * When an EMAIL is faked, its fake local-part carries a fake first/last name
 * (`nathan.brivet@…` stands in for `julien.sabourdin@…`). A model asked to write
 * TO that address naturally greets the person by that first name ("Bonjour
 * Nathan") — emitting a bare name token that is NOT itself a vault key, so
 * un-redaction can't restore it and the reply shows the WRONG name. Derive
 * reversible ALIASES (`Nathan → Julien`, `Brivet → Sabourdin`) by aligning the
 * fake and real local-part name tokens positionally; the caller registers them in
 * the vault (with collision guards) so the greeting reverses to the REAL name.
 * Generic mailboxes (`contact@`, `info@`) and non-name tokens yield no NAME alias.
 * The **domain after the `@`** is ALSO aliased (`mail.com → gmail.com`) — a domain
 * is identifying (a company domain especially) and the model can lift it out of the
 * fake email on its own, so it must reverse too. Pure + deterministic. Returns
 * `[fakeAlias, realValue]` pairs — a capitalised + lowercase pair per aligned name
 * token, plus one lowercase pair for the domain when the fake domain differs.
 */
export function emailNameAliases(realEmail: string, fakeEmail: string): [string, string][] {
  const realToks = emailLocalPart(realEmail).split(/[._+-]+/).filter(Boolean);
  const fakeToks = emailLocalPart(fakeEmail).split(/[._+-]+/).filter(Boolean);
  const out: [string, string][] = [];
  // A generic mailbox written WITH a separator (`no-reply`, `do.not.reply`) splits
  // into fragments that individually dodge the per-token check — test the whole
  // separator-stripped local-part too, so it never yields a personal-name alias.
  // And NAME aliases only for a PERSON: the first token must be a known given name
  // (see `isGivenName` — a common-word local-part aliased as a name corrupts that
  // word conversation-wide). Mirrors `buildFakeEmail`'s gate, so alias derivation
  // and fake construction agree on what is a person.
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
 * Build a fake email that keeps a person's fake identity STABLE across the whole
 * conversation: each name in the real local-part AND the domain after the `@` are
 * replaced by their EXISTING canonical fake when the caller already faked that
 * value elsewhere (`julien.talvas@gmail.com` → `nathan.<fake>@mail.com` once
 * "Julien" is faked "Nathan" and `gmail.com` is faked `mail.com`), so an atomic
 * mapping holds — every "julien" and every "gmail.com" resolves to the SAME fake.
 * `resolveFake(real)` returns that canonical fake or undefined; a FIRST-seen name
 * gets a fresh pool pick and the domain a fresh pool domain, both avoiding
 * `isTaken` collisions and different from the real value (so an identifying domain
 * never leaks by a coincidental same pick). Name fakes only for a PERSON — the first
 * local token must be a known given name ({@link isGivenName}); every other
 * local-part (`contact`, `notifications`, handles, digits) is shape-scrambled —
 * never turned INTO a fake name. With `keepKnownDomain` (the commercial notoriety
 * dispensation), a NOTORIOUS provider/service domain is kept VERBATIM instead of
 * swapped: `gmail.com` identifies nobody, and swapping it is what used to poison the
 * vault with a real-domain alias. The caller derives the reversible aliases
 * (names + domain) from the result via {@link emailNameAliases}. Deterministic
 * given (realEmail, attempt).
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
        // ⚠️ Test BOTH forms. What lands in the local part is the FOLDED
        // form (`valere`), not the pool candidate (`Valère`): checking only the
        // latter makes the guard miss the exact string it's supposed to protect, and
        // two people end up with the same address. Over-avoiding beats
        // colliding — it's the safe direction.
        const asMinted = foldAccents(cand.toLowerCase());
        if (cand.toLowerCase() === part.toLowerCase()) continue;
        if (isTaken(cand) || isTaken(asMinted)) continue;
        fakeCap = cand;
        break;
      }
    }
    nameIdx++;
    // ⚠️ Diacritics are FOLDED here, and only here: an accented local part
    // (« valère.sauvestre@ ») is not an address systems accept, and the
    // first tool that normalises it produces a string that is no longer a vault key —
    // the fake stops reversing. The person's DISPLAYED name keeps its accent (that's
    // prose, `buildFakeName`); the address doesn't. The rare-name pools made the case
    // common, it wasn't with « Tom » or « Hugo ».
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
    const pool = FAKE_EMAIL_DOMAINS.map((d) => d.replace(/^@/, "")); // bare domains
    domain = pool[(h + attempt) % pool.length];
    for (let k = 0; k < pool.length; k++) {
      const cand = pool[(h + attempt + k) % pool.length];
      if (cand.toLowerCase() !== realDomain.toLowerCase() && !isTaken(cand)) {
        domain = cand;
        break;
      }
    }
  }
  return `${out.join("")}@${domain}`;
}

