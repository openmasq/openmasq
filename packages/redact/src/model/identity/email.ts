// Atomic fake identity for EMAILS — one half of the `identity/` family (see `index.ts`).
// A real person's address must keep ONE stable fake everywhere, and the fake's local-part
// carries a greetable fake first/last name that must reverse to the REAL person.
// Pure + deterministic (no vault mutation here — the caller owns the vault).
import { FAKE_LAST, FAKE_EMAIL_DOMAINS, fakeToken, hashString, firstNamePool } from "../fakes";
import { capitalize, foldAccents } from "../../util";

// Mailbox local-parts that are NOT personal names — never derive a name alias
// from `contact@`, `info@`, `no-reply@`, … (there is no real person to restore to).
const GENERIC_MAILBOX = new Set([
  "contact", "contactus", "info", "hello", "bonjour", "support", "admin",
  "administrator", "team", "sales", "noreply", "donotreply", "service",
  "services", "help", "office", "mail", "email", "webmaster", "postmaster",
  "billing", "accounts", "jobs", "career", "careers", "press", "marketing",
  "hr", "rh", "compta", "commercial", "direction", "secretariat", "reply",
  "noreply", "donotreply",
]);

const isNameToken = (t: string) =>
  /^[A-Za-zÀ-ÿ]{3,}$/.test(t) && !GENERIC_MAILBOX.has(t.toLowerCase());

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
  if (!GENERIC_MAILBOX.has(realToks.join("").toLowerCase())) {
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
 * `isTaken` collisions and ALWAYS different from the real value (so the real domain
 * never leaks by a coincidental same pick). Non-name / generic-mailbox tokens
 * (`contact`, `no-reply`, digits) are shape-scrambled — never turned INTO a fake
 * name. The caller derives the reversible aliases (names + domain) from the result
 * via {@link emailNameAliases}. Deterministic given (realEmail, attempt).
 */
export function buildFakeEmail(
  realEmail: string,
  attempt: number,
  resolveFake: (real: string) => string | undefined,
  isTaken: (fake: string) => boolean,
  salt = 0,
): string {
  const h = hashString(realEmail) + salt + attempt * 101;
  const at = realEmail.lastIndexOf("@");
  const local = at > 0 ? realEmail.slice(0, at) : realEmail;
  const realDomain = at >= 0 ? realEmail.slice(at + 1) : ""; // bare, e.g. "gmail.com"
  const parts = local.split(/([._+-])/); // even index = token, odd = separator
  let nameIdx = 0;
  const out = parts.map((part, i) => {
    if (i % 2 === 1 || !part) return part; // keep separators / empties verbatim
    if (!isNameToken(part)) return fakeToken(part, h + i); // generic/short/numeric
    let fakeCap = resolveFake(capitalize(part)); // reuse the person's canonical fake…
    if (!fakeCap) {
      // …else pick a fresh, un-taken pool name (first token → same-gender FIRST, rest → LAST).
      const pool = nameIdx === 0 ? firstNamePool(part) : FAKE_LAST;
      fakeCap = pool[(h + attempt) % pool.length];
      for (let k = 0; k < pool.length; k++) {
        const cand = pool[(h + attempt + k) % pool.length];
        // ⚠️ Tester les DEUX formes. Ce qui atterrit dans la partie locale est la forme
        // PLIÉE (`valere`), pas le candidat du pool (`Valère`) : n'interroger que ce
        // dernier fait passer le garde à côté de la chaîne qu'il est censé protéger, et
        // deux personnes se retrouvent avec la même adresse. On sur-évite plutôt que de
        // percuter — c'est le sens sûr.
        const asMinted = foldAccents(cand.toLowerCase());
        if (cand.toLowerCase() === part.toLowerCase()) continue;
        if (isTaken(cand) || isTaken(asMinted)) continue;
        fakeCap = cand;
        break;
      }
    }
    nameIdx++;
    // ⚠️ Les diacritiques sont PLIÉS ici, et seulement ici : une partie locale accentuée
    // (« valère.sauvestre@ ») n'est pas une adresse que les systèmes acceptent, et le
    // premier outil qui la normalise produit une chaîne qui n'est plus une clé de coffre —
    // le faux ne se restitue plus. Le nom AFFICHÉ de la personne garde son accent (c'est
    // de la prose, `buildFakeName`) ; l'adresse, non. Les pools rares ont rendu le cas
    // fréquent, il ne l'était pas avec « Tom » ou « Hugo ».
    return foldAccents(fakeCap.toLowerCase());
  });
  // Domain after the `@`: reuse this real domain's canonical fake, else pick a fresh
  // pool domain that is DIFFERENT from the real one (never leak it by a same pick).
  let domain = realDomain ? resolveFake(realDomain) : undefined;
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

