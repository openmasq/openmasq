/**
 * Which WORDS of a path segment are meaning, not data — kept verbatim in the fake path.
 *
 * The engine's shared deny-lists (stopwords, generic terms, legal forms, countries, notorious
 * entities) answer first. `PATH_WORDS` only adds what a FILE NAME is made of and prose rarely
 * tags: document states, media words, month names, the words of a public body's name. It is
 * PATH-SCOPED on purpose: an entry here never spares a prose candidate, it only keeps a word
 * of a segment readable. Same discipline as `../vocab/index.ts` all the same — an entry ships
 * that word in clear inside every path, so NEVER a word that doubles as a surname or a first
 * name (« will », « bill », « price », « hall », « young », « mark » stay OUT).
 */
import { isStopword, isGenericTerm, isOrgAffix } from "../genericTerms";
import { isCountry } from "../../engine/geo/countries";
import { isNotoriousEntity, type NotorietyOpts } from "../notorious";

const PATH_WORDS = new Set(
  (
    // Document states and file-name furniture.
    "draft final signed unsigned copy copies version scan scanned screenshot screen capture " +
    "écran ecran photo photos image images img dsc pic pics video videos audio recording " +
    "files file folder dossier dossiers archive archives backup old new temp misc divers " +
    "notes note template modèle modele export import projet projets project projects " +
    "recto verso annexe annexes exhibit exhibits attachment attachments " +
    "results result records record set one two three four five part parts " +
    "amendment addendum employment proposal purchase payment payments summary annual " +
    "quarterly monthly weekly daily plan plans deck master services service application " +
    "family personal perso cases matters matter decree retainer resolution " +
    "acquisition diligence due interrogatories custody estate trust last testament " +
    "agreement agreements letter letters signature taxes tax banque compte rendu " +
    "comptabilité comptabilite grand livre cuisine rénovation renovation anniversaire " +
    "activités activites économiques economiques identité identite employeur salaire " +
    "relevé releve dépôt depot comptes annuels sur payroll mobile documents clients " +
    "contracts contrats invoices factures receipts reçus scans médical medical " +
    "suppress hearing transcript litigation discovery deposition settlement " +
    "immigration passport visa termination minutes board due memo report reports " +
    "statement statements dental media analytics industries logistics consulting conseil " +
    "studio partners associates holdings capital ventures labs solutions menuiserie " +
    "boulangerie " +
    // Months, FR + EN. The ones that are also FIRST NAMES are NOT here (`NAME_MONTHS`).
    "january february april july september october november december " +
    "janvier février fevrier juin juillet août aout septembre octobre novembre décembre decembre"
  ).split(/\s+/).filter(Boolean),
);

/** Months that are also first names: kept only beside a number (« June 2025 », « Mai 2024 »),
 *  where they are a date; alone they may be the person. */
const NAME_MONTHS = new Set(["march", "mars", "may", "mai", "june", "august", "avril"]);

/** Courtesy titles: kept verbatim, and they announce a NAME (`heuristic.ts`). */
export const HONORIFICS = new Set(["dr", "mr", "mrs", "ms", "mme", "mlle", "me", "maître", "maitre", "prof"]);

const lower = (w: string) => w.toLowerCase();

/**
 * True when `word` (a run of letters) is kept verbatim inside a fake path. `besideNumber`
 * says a digit token sits next to it in the segment (the month-as-date exception).
 */
export function isPathMeaningWord(word: string, notoriety: NotorietyOpts, besideNumber = false): boolean {
  const w = lower(word);
  if (w.length < 3) return true; // initials, `v`, `of` — too short to carry an identity
  if (PATH_WORDS.has(w) || HONORIFICS.has(w)) return true;
  if (NAME_MONTHS.has(w)) return besideNumber;
  if (isStopword(word) || isGenericTerm(word) || isOrgAffix(word)) return true;
  // A plural of a generic word (« Scans », « Contrats ») is the same word.
  if (w.endsWith("s") && w.length > 3) {
    const stem = word.slice(0, -1);
    if (PATH_WORDS.has(lower(stem)) || isGenericTerm(stem)) return true;
  }
  return isCountry(word) || isNotoriousEntity(word, "company", notoriety);
}
