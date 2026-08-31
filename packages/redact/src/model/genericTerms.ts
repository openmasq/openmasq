/**
 * Deny-lists shared by EVERY detector (LLM model, local BERT NER, and — via
 * `pseudonymize`'s choke point — the deterministic detectors): a candidate whose
 * ENTIRE value is one of these is NEVER redacted. Split out of `detect.ts` (which was
 * well over the ~300 LOC guideline) so the vocabulary has its own home. Pure data +
 * two O(1) predicates.
 */
import { isCurrency } from "./currencies";

// The multilingual function-word list lives in `stopwords.ts` (300-LOC split);
// re-exported here so every existing `./genericTerms` import keeps working.
import { isStopword } from "./stopwords";
export { isStopword };

import { GENERIC_TERMS } from "./genericTermsData";
import { CLINIQUE_TERMS } from "./vocab";
import { isPublicBodyCompound } from "./publicBodies";

/** Molecules, pathologies, anatomy — spared EXCEPT under the `health` category. */
const CLINICAL_TERMS = new Set(CLINIQUE_TERMS.map((t) => t.toLowerCase()));

/** True when `value` is a single generic document/design/type word (never PII).
 *  CASE-insensitive AND SEPARATOR-insensitive, so a dotted/spaced acronym form matches
 *  the same entry ("R.C.S." / "R C S" / "r-c-s" all → "rcs"). Only DELIMITERS
 *  (`. _ - ' ` + spaces) are stripped for the 2nd test — accents/letters are kept, so
 *  "résumé" is unaffected — and it's ADDITIVE to the exact-lowercase match, so a
 *  multi-word entry ("curriculum vitae") still matches via the plain lowercase form. */
/**
 * Days and months, full and abbreviated, FR + EN. Never an entity on their own.
 *
 * ⚠️ They're in the `Date:` header of EVERY e-mail, at the start of the line and capitalised —
 * exactly the shape a NER reads as a proper noun. Measured on a real mailbox
 * (log from 04/08): « Sun » redacted as an ORGANISATION, « Thu » as a PLACE.
 * The model received « Ash, 02 Aug 2026 » and « Gap, 30 Jul 2026 » — dates turned
 * unreadable, in a request that was specifically about « the week's e-mails ».
 *
 * WHOLE value only (that's `isGenericTerm`'s entry gate), so « Sun
 * Microsystems » or « Mars SA » remain candidates.
 */
const CALENDAR_TERMS = new Set([
  // Days — none doubles as a common first name, full and abbreviated, FR + EN.
  "mon", "tue", "tues", "wed", "weds", "thu", "thur", "thurs", "fri", "sat", "sun",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "lun", "mer", "jeu", "ven", "sam", "dim",
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  // Months — ABBREVIATED only, and only the ones that aren't also a first name or a
  // surname. « mars / avril / mai / march / april / may / june / august » stay
  // OUT: it's the allow-list discipline already pinned by `aiKinds.test.ts`, and
  // breaking it would leave someone named Avril or June in clear, forever.
  // « mar » is excluded for the same reason (mars/March), « sep » isn't.
  "jan", "janv", "feb", "févr", "fevr", "apr", "avr", "jul", "juil", "aug", "sept", "sep",
  "oct", "nov", "dec", "déc",
]);
export function isGenericTerm(value: string): boolean {
  const lower = value.trim().toLowerCase();
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
 * True when `value` is a COMPOUND (2+ words joined by spaces, hyphens, underscores,
 * dots or slashes) whose EVERY word is a stopword, a generic term or a bare number —
 * a tool identifier or technical phrase, never an identity. This is what stops a
 * flagged "read-data-schema" / "Read data schema" / "query-trends" (MCP tool
 * metadata) from becoming a multi-word NAME whose per-word aliases then redact
 * every "data"/"query" in the conversation. Same allow-list stance as the word
 * lists themselves: ONE non-covered word ("Jean-Rebour", "Cabinet Berlioz") keeps
 * the candidate — and a DIGIT token counts as non-covered on purpose, so a spaced
 * phone ("06 12 34 56 78") or a slashed date can never read as a generic compound.
 */
export function isGenericCompound(value: string): boolean {
  // The split also breaks on an APOSTROPHE: French elision welds a function word to the
  // next one, so « de courtage d'assurances » / « Caisse d'Épargne » kept `d'assurances`
  // as ONE uncovered token and the whole institutional phrase survived — faked to an
  // invented company. `d` + `assurances` are both covered. Splitting can only ever make
  // MORE tokens and one uncovered token still keeps the candidate, so a real elided name
  // ("d'Aubigné" → `d` + `aubigné`) is unaffected.
  const words = value.trim().split(/[\s._/'’-]+/u).filter(Boolean);
  if (words.length < 2) return false;
  return words.every((w) => isStopword(w) || isGenericTerm(w));
}

/**
 * True when `value` minus ONE leading article — ANY case, the covered languages'
 * articles — is a stopword/generic term. `stripLeadingArticle` deliberately keeps
 * a CAPITALIZED article ("Le Mans" stays whole), so a sentence-initial "La
 * réunion" slipped past the generic drop and the recase pass redacted the word
 * for "meeting" across French business text. This check is case-blind but does
 * NOT change the emitted value. ("La Réunion" the island is knowingly dropped
 * too — the meeting reading floods; a region ships in clear like a country.)
 */
export function isGenericWithArticle(value: string): boolean {
  const m = /^(?:l['’]|(?:le|la|les|un|une|des|du|the|an?|el|los|las|il|lo|gli|der|die|das|os?|as)\s+)([\s\S]+)$/iu.exec(
    value.trim(),
  );
  if (!m) return false;
  const rest = m[1].trim();
  return isStopword(rest) || isGenericTerm(rest);
}

/**
 * **The ONE "this value is never PII on its own" test.** Every candidate pipeline calls
 * THIS, not a hand-picked subset of the four predicates above.
 *
 * ⚠️ It exists because the three call sites had drifted into three different answers to
 * the same question: `pseudonymize`'s choke point (`filter.ts`) checked term+compound,
 * the LLM/NER reader (`detect.ts`) checked stopword+term+article, and the marker-mode
 * path (`discoverSecrets`) checked only stopword+term. So the SAME value could be spared
 * as a fake and redacted as a marker — one deny-list, three behaviours, and no test could
 * state which was right (root rule 9).
 *
 * Widening a site is the SAFE direction here: every list these read is "never PII by
 * construction", so an extra check can only stop a non-PII word from being faked. The
 * reverse — a site that checks less — is what shipped "URSSAF" as somebody's surname.
 */
// « RCS LILLE (MÉTROPOLE) », « Greffe de Nanterre »: a public REGISTRY MENTION —
// it identifies the registry, never the company or the person. A NER tags it ORG and
// it was going to the vault (« VOXA LABS → RCS LILLE », log 02/08). Strict prefix:
// « RCS MediaGroup » would be spared too — acceptable, it's a notorious brand.
const REGISTRY_MENTION_RE = /^(rcs|greffe)\s+\S/i;

export function isNonPiiTerm(value: string, category?: string): boolean {
  return (
    isStopword(value) ||
    isGenericTerm(value) ||
    REGISTRY_MENTION_RE.test(value.trim()) ||
    isGenericCompound(value) ||
    isGenericWithArticle(value) ||
    isClinicalTerm(value, category) ||
    isPublicBodyCompound(value)
  );
}

/**
 * A medication, a pathology or a body part — spared for EVERY category
 * EXCEPT `health`.
 *
 * The scoping is this volume's whole reason for being. « DOLIPRANE » goes to the vault because a NER
 * tags it ORGANISATION, not because someone saw a diagnosis in it: it's THAT
 * reflex we're turning off. Under `health`, the value keeps obeying the user's
 * « Santé » setting, which is the only category whose job is to mask an illness —
 * sparing it flat-out would have made it inert (`aiKinds.test.ts` verifies this).
 *
 * Absent `category` ⇒ spared: callers with no category (marker mode, the detector's
 * own reader) never intended to redact a medication.
 */
export function isClinicalTerm(value: string, category?: string): boolean {
  if (category === "health") return false;
  return CLINICAL_TERMS.has(value.trim().toLowerCase());
}

// Company legal FORMS + leading descriptors STRIPPED from the ends of an ORG span so
// a real company keeps ONE identity regardless of the surrounding boilerplate:
// "société KARL STUDIO", "KARL STUDIO SAS" and "KARL STUDIO Forme" all canonicalise to
// "KARL STUDIO" (else each distinct span became a DIFFERENT fake — the reported
// "plusieurs mappings"). ROLE / connector words ("associé", "&") are deliberately NOT
// here: they belong to a legal name ("Rebour & Associés") and stripping them would
// mangle it. Applied ONLY to ORG detections (a NAME/CITY never leads with "société").
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
  // Table/field glue "Associés - KARL STUDIO en société": when everything LEFT of a
  // spaced dash/colon is generic boilerplate, the entity is the RIGHT side (the label
  // stays in clear). The space around the dash is required so a hyphenated name
  // ("Jean-Claude Décor") is never split. Without this, the whole span becomes the
  // vault key and a STANDALONE occurrence of the name elsewhere leaks in clear.
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
