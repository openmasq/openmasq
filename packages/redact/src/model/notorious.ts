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
import { PEOPLE, COMMERCIAL_ORGS, ORGS, TICKERS, ORG_PREFIXES } from "./notoriousData";

// The curated LISTS live in `./notoriousData.ts` (data/logic split, 300-LOC rule); the
// app-facing exports stay HERE so every consumer keeps one import path.
export { NOTORIOUS_PEOPLE, NOTORIOUS_COMMERCIAL_ORGS } from "./notoriousData";

const PEOPLE_SET = new Set(PEOPLE.map(norm));
const ORGS_SET = new Set([...ORGS, ...TICKERS].map(norm));
// La dispense commerciale opt-in — un set SÉPARÉ, jamais fusionné dans ORGS_SET : la
// fusion serait le retour silencieux de la dispense inconditionnelle du 27/07.
const COMMERCIAL_SET = new Set(COMMERCIAL_ORGS.map(norm));
// Tickers are checked CASE-SENSITIVELY (the raw ALL-CAPS symbols) for the
// category-independent branch below.
const TICKER_SET = new Set(TICKERS);

/** First one/two lowercase words of a value (accents kept — issuer names carry none). */
const leadWords = (value: string): [string, string] => {
  const w = value.trim().toLowerCase().split(/\s+/);
  return [w[0] ?? "", w.slice(0, 2).join(" ")];
};

/** Contexte optionnel de la dispense, passé par l'app selon le NIVEAU de protection
 *  (la politique : `@openmasq/ui` `privacy/privacyLevel.ts` — tout sauf Strict).
 *  - `commercial: true` (OPT-IN, défaut faux) = les MARQUES commerciales — intégrations
 *    MCP de l'app comprises — rejoignent la dispense, category-scoped comme le reste.
 *  - `people: false` (OPT-OUT, défaut vrai) = le niveau Strict : les PERSONNALITÉS
 *    aussi sont redacted. Les pays et tickers restent dispensés (un pays redacted
 *    fait dériver le modèle sur la géographie d'un autre). */
export interface NotorietyOpts {
  commercial?: boolean;
  people?: boolean;
  /**
   * Autoriser la dispense de FORME (la grammaire des noms de modèles) ? Vrai par défaut.
   *
   * ⚠️ Le gate de FRAGMENT (`pseudonymize/textContext.ts`) la met à FAUX, et c'est une
   * garde, pas une optimisation : il recompose « valeur + voisin » pour rattraper un
   * fragment d'entité notoire (« emploi » à côté de « Pôle »). Une liste fermée s'y
   * prête ; une GRAMMAIRE productive, non — « madame Claude 3 fois cette semaine »
   * recomposait « Claude 3 », un vrai nom de modèle, et faisait partir en clair l'un des
   * prénoms français les plus répandus (audit 13/08, épinglé par `modelNames.test.ts`).
   */
  shape?: boolean;
}

/**
 * True when `value` is a notorious PUBLIC entity for the given COARSE category
 * (`redactionCategory` output): a famous person for "name", a major brand / fund
 * issuer / index / ticker for "company", a country for "location". Anything else —
 * including these same strings under ANOTHER category — is not spared.
 */
/** « HSBC FRANCE », « Google France », « Amazon Belgique » : la filiale nationale = la
 *  marque + un PAYS en queue. Aucune liste ne peut énumérer chaque déclinaison — quand
 *  la valeur multi-mots ne matche pas telle quelle, on réessaie SANS le pays final
 *  (journal 02/08 : « HSBC FRANCE » redacted en personne, « FRANCE » aliasé partout). */
function withoutTrailingCountry(s: string): string | null {
  const words = s.trim().split(/\s+/);
  if (words.length < 2) return null;
  return isCountry(words[words.length - 1]) ? words.slice(0, -1).join(" ") : null;
}

/**
 * La même valeur SANS sa forme juridique — « Ovh Sas », « GitHub Inc », « Github, Inc. ».
 *
 * ⚠️ C'est un LIBELLÉ BANCAIRE qui l'a imposé (constat parcours du 15/08/2026, relevé
 * réel) : en Renforcé, « Ovh Sas » et « Github, Inc. » étaient REDACTED alors que la
 * politique les dispense — le suffixe juridique ratait la dispense — pendant qu'un vrai
 * client, lui, partait en clair. L'inverse de l'intention : les marques mondiales masquées,
 * la PME identifiable en clair.
 *
 * ⚠️ Sens FAIL-OPEN, donc borné : la forme juridique n'a jamais été le discriminant
 * (n'importe qui dépose « Orange SARL »), et le risque existe DÉJÀ pour la même raison sans
 * suffixe — une société réellement nommée « Orange » est dispensée aujourd'hui. On étend
 * une exposition acceptée, on n'en crée pas une nouvelle. Ce qui n'est PAS dispensé le
 * reste : « Karl Studio SAS » et « Apple Consulting » (mesurés). Même forme que
 * `withoutTrailingCountry` juste au-dessus, et `stripOrgAffixes` est l'unique implémentation
 * du vocabulaire des formes juridiques (règle 9).
 */
function withoutLegalForm(s: string): string | null {
  // La ponctuation de bord d'abord : « Github, Inc. » n'élaguait pas, le « , » collé au
  // premier mot empêchait l'appariement du suffixe.
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
  if (coarseCategory === "location") return isCountry(v) || isStateInstitution(v);
  if (coarseCategory === "name") {
    // `people: false` = le niveau Strict — les personnalités redeviennent redacted.
    if (opts?.people !== false && PEOPLE_SET.has(norm(v))) return true;
    // Un NOM DE MODÈLE étiqueté personne (« Claude Sonnet 4.6 », « GPT-4o ») est le
    // produit mal-lu — même logique que l'org mal-lu plus bas, et comme elle, JAMAIS
    // pour un mot nu sans chiffre : « Claude »/« Gemini » seuls restent des prénoms
    // protégés (audit 13/08 — la dispense est de forme, la protection de personne).
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
    // Les noms de MODÈLES D'IA par leur FORME (famille + version/variante) — aucune
    // liste ne suit un catalogue vivant. Insensible au niveau, comme ORGS : redact
    // « GPT-5.5 » rend l'app incapable de parler de ses propres modèles.
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
