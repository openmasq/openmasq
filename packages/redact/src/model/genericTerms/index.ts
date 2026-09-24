/**
 * Deny-lists shared by EVERY detector (LLM, local NER, and via `pseudonymize`'s choke point
 * the deterministic detectors): a candidate whose ENTIRE value is one of these is NEVER
 * redacted. Pure data + O(1) predicates.
 */
import { isCurrency } from "./currencies";

// The multilingual function-word list lives in `stopwords.ts`; re-exported here.
import { isStopword } from "./stopwords";
export { isStopword };

import { GENERIC_TERMS } from "./data";
import { CLINICAL_TERMS } from "../vocab";
import { isPublicBodyCompound } from "./publicBodies";
import { isShellCommandOccurrence } from "./shell";
export { isShellCommandOccurrence };

/** Molecules, pathologies, anatomy — spared EXCEPT under the `health` category. */
const CLINICAL_TERM_SET = new Set(CLINICAL_TERMS.map((t) => t.toLowerCase()));

/**
 * Days and months, full and abbreviated, FR + EN. Never an entity on their own: they open
 * the `Date:` header of EVERY e-mail, capitalised — exactly what a NER reads as a proper
 * noun. WHOLE value only, so « Sun Microsystems » or « Mars SA » remain candidates.
 */
const CALENDAR_TERMS = new Set([
  // Days — none doubles as a common first name, full and abbreviated, FR + EN.
  "mon", "tue", "tues", "wed", "weds", "thu", "thur", "thurs", "fri", "sat", "sun",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "lun", "mer", "jeu", "ven", "sam", "dim",
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  // Months — ABBREVIATED only, and only the ones that aren't also a first name or a
  // surname (« mars / avril / mai / may / june / august » stay OUT: someone named Avril
  // or June would be in clear forever — `aiKinds.test.ts`).
  "jan", "janv", "feb", "févr", "fevr", "apr", "avr", "jul", "juil", "aug", "sept", "sep",
  "oct", "nov", "dec", "déc",
]);
/** A MARKUP tag — « <br> », « </label> » — is document structure, never a value: a NER tags
 *  it, and the fake rewrites the page's own markup. */
const MARKUP_TAG = /^<\/?[a-z][\w:.-]*(?:\s[^<>]*)?\/?>$/i;

/** True when `value` is a single generic document/design/type word (never PII). CASE- and
 *  SEPARATOR-insensitive ("R.C.S." / "R C S" → "rcs"): only DELIMITERS are stripped for
 *  the 2nd test, ADDITIVE to the exact-lowercase match. */
export function isGenericTerm(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (MARKUP_TAG.test(lower)) return true;
  if (GENERIC_TERMS.has(lower)) return true;
  // A glued abbreviation period (« Aug. », « janv. ») is part of the word, not the value.
  if (CALENDAR_TERMS.has(lower.replace(/\.$/, ""))) return true;
  const noSep = lower.replace(/[.\s_'’-]+/g, "");
  if (noSep !== lower && GENERIC_TERMS.has(noSep)) return true;
  // A currency code/symbol/name is never PII either — spare it here so EVERY
  // detector benefits (a bare "EUR" was faked to "ASH"). See `currencies.ts`.
  return isCurrency(value);
}

/**
 * True when `value` is a COMPOUND (2+ words joined by spaces, hyphens, underscores, dots
 * or slashes) whose EVERY word is a stopword or a generic term — a tool identifier
 * ("read-data-schema"), never an identity. ONE non-covered word keeps the candidate, and
 * a DIGIT token counts as non-covered on purpose (a spaced phone is never a compound).
 */
export function isGenericCompound(value: string): boolean {
  // The split also breaks on an APOSTROPHE: French elision welds a function word to the
  // next one (« Caisse d'Épargne »). Splitting only makes MORE tokens and one uncovered
  // token still keeps the candidate, so a real elided name ("d'Aubigné") is unaffected.
  const words = value.trim().split(/[\s._/'’-]+/u).filter(Boolean);
  if (words.length < 2) return false;
  return words.every((w) => isStopword(w) || isGenericTerm(w));
}

/**
 * True when `value` minus ONE leading article (ANY case) is a stopword/generic term.
 * `stripLeadingArticle` keeps a CAPITALIZED article ("Le Mans" stays whole), so a
 * sentence-initial "La réunion" needs this case-blind check, which does NOT change the
 * emitted value. ("La Réunion" the island is knowingly dropped too.)
 */
export function isGenericWithArticle(value: string): boolean {
  const m = /^(?:l['’]|(?:le|la|les|un|une|des|du|the|an?|el|los|las|il|lo|gli|der|die|das|os?|as)\s+)([\s\S]+)$/iu.exec(
    value.trim(),
  );
  if (!m) return false;
  const rest = m[1].trim();
  return isStopword(rest) || isGenericTerm(rest);
}

// « RCS LILLE (MÉTROPOLE) », « Greffe de Nanterre »: a public REGISTRY MENTION identifies
// the registry, never the company. Strict prefix: « RCS MediaGroup » is spared too — a
// notorious brand anyway.
const REGISTRY_MENTION_RE = /^(rcs|greffe)\s+\S/i;

/**
 * **The ONE "this value is never PII on its own" test.** Every candidate pipeline calls
 * THIS, not a hand-picked subset of the predicates above (rule 9): a site that checks less
 * ships "URSSAF" as somebody's surname. Widening a site is the SAFE direction — every list
 * these read is "never PII by construction".
 */
export function isNonPiiTerm(value: string, category?: string, input?: string): boolean {
  return (
    isStopword(value) ||
    // A command name spared only where the text proves a command line (`shell.ts`): the
    // agent next door WRITES shell, and a fake for `ls` rewrites the line it runs.
    isShellCommandOccurrence(value, input) ||
    isGenericTerm(value) ||
    REGISTRY_MENTION_RE.test(value.trim()) ||
    isGenericCompound(value) ||
    isGenericWithArticle(value) ||
    isClinicalTerm(value, category) ||
    isPublicBodyCompound(value)
  );
}

/**
 * A medication, a pathology or a body part — spared for EVERY category EXCEPT `health`:
 * « DOLIPRANE » reaches the vault because a NER tags it ORGANISATION, and THAT reflex is
 * turned off; under `health` the value keeps obeying the « Santé » setting
 * (`aiKinds.test.ts`). Absent `category` ⇒ spared.
 */
export function isClinicalTerm(value: string, category?: string): boolean {
  if (category === "health") return false;
  return CLINICAL_TERM_SET.has(value.trim().toLowerCase());
}

// Company legal FORMS + leading descriptors STRIPPED from the ends of an ORG span so a
// real company keeps ONE identity whatever the boilerplate ("société KARL STUDIO", "KARL
// STUDIO SAS" → "KARL STUDIO"). ROLE / connector words ("associé", "&") are NOT here: they
// belong to a legal name ("Rebour & Associés"). ORG detections ONLY.
const ORG_AFFIX = new Set<string>([
  // French legal forms
  "sas", "sasu", "sarl", "eurl", "snc", "sci", "scop", "gie", "scs", "sca",
  "selarl", "selas", "sccv", "scm", "scp", "gaec", "earl", "eirl", "sa",
  // International legal forms / suffixes
  "inc", "incorporated", "ltd", "limited", "llc", "llp", "corp", "corporation",
  "co", "company", "gmbh", "ag", "plc", "kg", "srl", "spa", "bv", "nv", "oy",
  "ab", "sl", "holding", "holdings", "group", "groupe",
  // French company descriptors (typically LEAD the name)
  "société", "societe", "sté", "ste", "entreprise", "compagnie", "cie", "cabinet",
  "enseigne", "établissement", "etablissement", "établissements", "etablissements",
  "association", "fondation", "coopérative", "cooperative", "mutuelle",
  // Observed extraction glue ("KARL STUDIO Forme" — a "Forme juridique" field label)
  "forme",
]);

/** True when `word` is a company legal form / leading descriptor (see `ORG_AFFIX`).
 *  Surrounding punctuation ("SAS," / ".Groupe") is trimmed; case-insensitive. */
export function isOrgAffix(word: string): boolean {
  return ORG_AFFIX.has(word.trim().toLowerCase().replace(/^[.,]+|[.,]+$/g, ""));
}

// A connector left DANGLING at the end of a span once an affix is stripped ("KARL STUDIO
// en société" → "KARL STUDIO en" → "KARL STUDIO"). End-position only, so a connector
// INSIDE a legal name ("Bank of America") is never reached by the trailing loop.
const ORG_TRAILING_CONNECTOR = new Set(["en", "de", "du", "des", "et", "of", "the", "&", "und"]);

// Strip ORG_AFFIX words (see above) from BOTH ends of an ORG span so the distinctive
// CORE ("KARL STUDIO") is the vault key; the generic word stays in CLEAR. Never strips
// to empty — a value that is ALL affix (bare "SAS") is left for the `isGenericTerm`
// whole-value drop. ORG detections ONLY.
export function stripOrgAffixes(value: string): string {
  let v = value.trim();
  // Table/field glue "Associés - KARL STUDIO en société": when everything LEFT of a spaced
  // dash/colon is generic boilerplate, the entity is the RIGHT side, else a STANDALONE
  // occurrence of the name elsewhere leaks. The space around the dash keeps a hyphenated
  // name ("Jean-Claude Décor") whole.
  const sep = /^(.+?)\s[-–—:]\s+(.{2,})$/.exec(v);
  if (sep && sep[1].split(/\s+/).every((w) => isOrgAffix(w) || isStopword(w) || isGenericTerm(w)))
    v = sep[2].trim();
  let words = v.split(/\s+/).filter(Boolean);
  while (words.length > 1 && isOrgAffix(words[0])) words = words.slice(1);
  while (
    words.length > 1 &&
    (isOrgAffix(words[words.length - 1]) ||
      ORG_TRAILING_CONNECTOR.has(words[words.length - 1].toLowerCase()))
  ) {
    words = words.slice(0, -1);
  }
  const stripped = words.join(" ").trim();
  return stripped.length >= 2 ? stripped : value;
}
