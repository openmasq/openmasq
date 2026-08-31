/**
 * NOTORIOUS public entities — world knowledge, never the user's own data. A candidate
 * whose ENTIRE value is a famous public figure, a major company/brand, a fund
 * issuer/index/ticker, or a COUNTRY is dropped at the `filterCandidates` choke point:
 * faking it makes the model reason about nobody ("qui est Albert Einstein ?" → a fake
 * answers about a stranger; a faked ETF ticker sends an agent into verification loops).
 *
 * ⚠️ This is an ALLOW-list (the value ships to the model in clear), so a wrong entry is
 * a PERMANENT leak for that word — same discipline as `genericTerms.ts`:
 * - CATEGORY-SCOPED: people match only a NAME candidate, brands only a COMPANY one, and
 *   countries only a LOCATION one. So a real person surnamed "Hermès"/"Tesla" (NAME) is
 *   still redacted even though the brand (COMPANY) is spared, and the country list can
 *   omit nothing by accident: "Jordan"/"Georgia"/"Chad" are simply not in it (see
 *   `../engine/geo/countries.ts` — recognition is that curated list, nothing broader).
 * - UNAMBIGUOUS entries only: a mononym goes in only when it has no plausible life as a
 *   private surname ("einstein", "mozart"); the doubtful keep their FULL name form
 *   ("tim cook", "marie curie" — never bare "cook"/"curie").
 * - `keep`, `forced` and org-mandated (`unrevealable`) categories are handled by the
 *   filter itself and outrank this list.
 *
 * Curated SEED, deliberately small and readable. The long tail (a vendored, sha256-pinned
 * Wikidata/tickers dataset) is a follow-up — extend the sets, keep the discipline.
 */
import { isCountry } from "../engine/geo/countries";
import { norm, isStateInstitution } from "./notoriousState";
import { stripOrgAffixes } from "./genericTerms";
import { isAiModelName } from "./modelNames";
import { isNotoriousDomain, isNotoriousServiceEmail } from "./notoriousDomains";
import { PEOPLE, COMMERCIAL_ORGS, ORGS, TICKERS, ORG_PREFIXES } from "./notoriousData";

// The curated LISTS live in `./notoriousData.ts` (data/logic split, 300-LOC rule); the
// app-facing exports stay HERE so every consumer keeps one import path.
export { NOTORIOUS_PEOPLE, NOTORIOUS_COMMERCIAL_ORGS } from "./notoriousData";

const PEOPLE_SET = new Set(PEOPLE.map(norm));
const ORGS_SET = new Set([...ORGS, ...TICKERS].map(norm));
// The opt-in commercial dispensation — a SEPARATE set, never merged into ORGS_SET: the
// merge would be the silent return of the unconditional dispensation from 27/07.
const COMMERCIAL_SET = new Set(COMMERCIAL_ORGS.map(norm));
// Tickers are checked CASE-SENSITIVELY (the raw ALL-CAPS symbols) for the
// category-independent branch below.
const TICKER_SET = new Set(TICKERS);

/** First one/two lowercase words of a value (accents kept — issuer names carry none). */
const leadWords = (value: string): [string, string] => {
  const w = value.trim().toLowerCase().split(/\s+/);
  return [w[0] ?? "", w.slice(0, 2).join(" ")];
};

/** Optional dispensation context, passed by the app according to the protection LEVEL
 *  (the policy: `@openmasq/ui` `privacy/privacyLevel.ts` — everything except Strict).
 *  - `commercial: true` (OPT-IN, default false) = commercial BRANDS — including the app's
 *    MCP integrations — join the dispensation, category-scoped like the rest.
 *  - `people: false` (OPT-OUT, default true) = the Strict level: PUBLIC FIGURES
 *    also get redacted. Countries and tickers stay dispensed (a redacted country
 *    makes the model drift onto another one's geography). */
export interface NotorietyOpts {
  commercial?: boolean;
  people?: boolean;
  /**
   * Allow the SHAPE dispensation (the model-name grammar)? True by default.
   *
   * ⚠️ The FRAGMENT gate (`pseudonymize/textContext.ts`) sets it to FALSE, and it's a
   * safeguard, not an optimization: it recomposes "value + neighbour" to catch a
   * fragment of a notorious entity (« emploi » next to « Pôle »). A closed list lends
   * itself to that; a productive GRAMMAR does not — « madame Claude 3 fois cette semaine »
   * was recomposing « Claude 3 », a real model name, and was sending one of the
   * most common French first names out in clear (audit 13/08, pinned by `modelNames.test.ts`).
   */
  shape?: boolean;
}

/**
 * True when `value` is a notorious PUBLIC entity for the given COARSE category
 * (`redactionCategory` output): a famous person for "name", a major brand / fund
 * issuer / index / ticker for "company", a country for "location". Anything else —
 * including these same strings under ANOTHER category — is not spared.
 */
/** « HSBC FRANCE », « Google France », « Amazon Belgique »: the national subsidiary = the
 *  brand + a trailing COUNTRY. No list can enumerate every declension — when
 *  the multi-word value doesn't match as-is, we retry WITHOUT the trailing country
 *  (log 02/08: « HSBC FRANCE » redacted as a person, « FRANCE » aliased everywhere). */
function withoutTrailingCountry(s: string): string | null {
  const words = s.trim().split(/\s+/);
  if (words.length < 2) return null;
  return isCountry(words[words.length - 1]) ? words.slice(0, -1).join(" ") : null;
}

/**
 * The same value WITHOUT its legal form — « Ovh Sas », « GitHub Inc », « Github, Inc. ».
 *
 * ⚠️ It was a BANK STATEMENT LABEL that forced this (user-journey finding from 15/08/2026, a
 * real statement): in Enhanced, « Ovh Sas » and « Github, Inc. » were being REDACTED even though
 * the policy dispenses them — the legal suffix was missing the dispensation — while a real
 * customer, itself, was going out in clear. The opposite of the intent: the world brands masked,
 * the identifiable SMB in clear.
 *
 * ⚠️ FAIL-OPEN direction, so bounded: the legal form was never the discriminant
 * (anyone can register "Orange SARL"), and the risk ALREADY exists for the same reason without
 * the suffix — a company genuinely named "Orange" is dispensed today. We're extending
 * an accepted exposure, not creating a new one. What is NOT dispensed
 * stays that way: « Karl Studio SAS » and « Apple Consulting » (measured). Same shape as
 * `withoutTrailingCountry` just above, and `stripOrgAffixes` is the sole implementation
 * of the legal-form vocabulary (rule 9).
 */
function withoutLegalForm(s: string): string | null {
  // Edge punctuation first: « Github, Inc. » wasn't trimming, the « , » glued to the
  // first word was preventing the suffix from matching.
  const clean = s.trim().replace(/[,;.]+\s*$/u, "").replace(/,\s+/g, " ");
  const core = stripOrgAffixes(clean).trim();
  return core && core !== clean ? core : null;
}

export function isNotoriousEntity(value: string, coarseCategory: string, opts?: NotorietyOpts): boolean {
  const v = value?.trim();
  if (!v) return false;
  // A listed TICKER is spared under ANY category: a NER routinely tags a bare "SPY"/
  // "AAPL" as a PERSON (observed: SPY→"Léa", AAPL→"Antoine" in a run_python result),
  // and a symbol the model can't read verbatim derails every market workflow. Scoped
  // hard: exact ALL-CAPS match against the curated list only — a lowercase "spy" in
  // prose, or any word that merely resembles a symbol, is not spared.
  if (/^[A-Z]{2,5}$/.test(v) && TICKER_SET.has(v)) return true;
  // A notorious service/provider DOMAIN is the brand in its DNS spelling — a NER tags it
  // company, location or name at whim, so the check is category-independent like the
  // tickers. Commercial-gated like the brand lists (Strict keeps redacting it), and
  // exact-shape only (`notoriousDomains.ts`) — never a fragment of a longer value.
  if (opts?.commercial === true && isNotoriousDomain(v)) return true;
  // A TRANSACTIONAL sender at a notorious domain (`security@updates.linear.app`) is the
  // service's identity, never a person's address — double-gated (domain AND a service
  // mailbox local-part), commercial-gated, see `notoriousDomains.ts`. A personal-looking
  // address at the same domain falls through and stays redacted.
  if (coarseCategory === "email") return isNotoriousServiceEmail(v, opts);
  if (coarseCategory === "location") return isCountry(v) || isStateInstitution(v);
  if (coarseCategory === "name") {
    // `people: false` = the Strict level — public figures become redacted again.
    if (opts?.people !== false && PEOPLE_SET.has(norm(v))) return true;
    // A MODEL NAME tagged as a person (« Claude Sonnet 4.6 », « GPT-4o ») is the
    // product mis-read — same logic as the mis-read org below, and like it, NEVER
    // for a bare word with no digit: « Claude »/« Gemini » alone stay protected
    // first names (audit 13/08 — the dispensation is of shape, the protection of person).
    if (
      opts?.shape !== false &&
      (/\s/.test(v) || /\d/.test(v)) &&
      isAiModelName(v, { allowBare: false })
    )
      return true;
    // A MULTI-WORD span equal to a famous ORG but tagged as a NAME is the org
    // mis-read (the first-name gazetteer pairs "France" + "Travail"; a NER tags
    // "Banque Populaire" PER) — no private person carries an institution's full
    // name. SINGLE words keep the category scoping untouched: a person surnamed
    // "Hermès"/"Tesla" is still redacted. The commercial set joins ONLY here
    // (multi-word — "BNP Paribas" tagged PER), never for a single word.
    if (!/\s/.test(v.trim())) return false;
    if (ORGS_SET.has(norm(v)) || (opts?.commercial === true && COMMERCIAL_SET.has(norm(v)))) return true;
    for (const core of [withoutTrailingCountry(v), withoutLegalForm(v)]) {
      if (core && (ORGS_SET.has(norm(core)) || (opts?.commercial === true && COMMERCIAL_SET.has(norm(core)))))
        return true;
    }
    return false;
  }
  if (coarseCategory === "company") {
    // A COUNTRY mis-tagged as an ORG ("la France a signé…") is the state — world
    // knowledge, spared here too. NOT for "name": France/Chad/… are real first
    // names, and a person keeps their protection.
    if (isCountry(v)) return true;
    if (isStateInstitution(v)) return true;
    // AI MODEL names by their SHAPE (family + version/variant) — no
    // list can keep up with a living catalog. Level-insensitive, like ORGS: redacting
    // « GPT-5.5 » makes the app unable to talk about its own models.
    if (opts?.shape !== false && isAiModelName(v)) return true;
    if (ORGS_SET.has(norm(v))) return true;
    if (opts?.commercial === true && COMMERCIAL_SET.has(norm(v))) return true;
    for (const core of [withoutTrailingCountry(v), withoutLegalForm(v)]) {
      if (core && (ORGS_SET.has(norm(core)) || (opts?.commercial === true && COMMERCIAL_SET.has(norm(core)))))
        return true;
    }
    const [one, two] = leadWords(v);
    return ORG_PREFIXES.has(one) || ORG_PREFIXES.has(two);
  }
  return false;
}
