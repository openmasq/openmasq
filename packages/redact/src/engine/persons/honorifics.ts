// Honorific → NAME detector. "madame keller", "mr welby", "Frau Ostermann": the
// TITLE is a strong, language-scoped signal that the next token is a person —
// exactly where the cased NER fails (all-lowercase typing, punctuation-less
// transcripts). Deterministic sibling of `contextFields.ts`: the title stays in
// clear (it is generic, and already a GENERIC_TERMS standalone-drop); only the
// name is emitted.
//
// Precision model, per title FAMILY:
//  - BARE (FR/EN core): "monsieur"/"mme"/"mr"/"dr"… are ~always followed by a
//    proper name, so they fire even on an all-lowercase name.
//  - DOTTED: abbreviations whose bare word is something else entirely ("m" a
//    letter, "pr" a pull request, "sr" seniority) — the dot is REQUIRED.
//  - CASED (de/es/it/pt): "frau"/"señora"/"signora" double as common nouns in
//    prose ("die frau kam", "una señora mayor") and those languages' verbs are
//    beyond the stopword net — so the NAME must be Capitalized in the original.
// Every candidate token also passes the shared stopword/generic/country guards,
// so "madame la présidente" / "monsieur veut-il" never yield a candidate.
import type { Detection } from "../../types";
import { isStopword, isGenericTerm } from "../../model/genericTerms";
import { isCountry } from "../geo/countries";
import { FIRST_NAMES } from "../names/firstNames.data";

const BARE_TITLES = [
  "monsieur", "madame", "mademoiselle", "mme", "mlle",
  "maître", "maitre", "docteur", "professeur",
  "mr", "mrs", "ms", "dr", "prof",
];

const DOTTED_TITLES = ["m", "pr", "sr", "sra", "srta", "sig", "dott", "dra"];

const CASED_TITLES = [
  "herr", "herrn", "frau",
  "señor", "señora", "señorita", "doña", "don",
  "signor", "signore", "signora", "signorina",
  "dottor", "dottore", "dottoressa",
  "senhor", "senhora",
  // English court and rank titles. Their bare word is prose ("yes sir we", "the lord
  // said") so the NAME must be Capitalized — in the judgments they come from it is.
  "sir", "lady", "lord", "judge", "sergeant", "professor",
  // French civil-status MAIDEN/MARRIAGE name anchors ("MORVAN Jacqueline née
  // BERTIN", "SAVARY épouse LEFEVRE") — cased on purpose: the following word must
  // be Capitalized, so "née le 17 mars" / "il épouse marie" (verb, lowercase) and
  // "né en Bretagne" never fire; a birth DATE after "née" is `birthDates.ts`' job.
  // (bare "ne" is deliberately OMITTED — the French negation is everywhere.)
  "né", "née", "nee", "épouse", "epouse",
];

const CASED_SET = new Set(CASED_TITLES);
const TITLE_WORDS = new Set([...BARE_TITLES, ...DOTTED_TITLES, ...CASED_TITLES]);

// "die frau kam herein": an article/determiner before herr/frau selects the
// COMMON-NOUN reading, never the honorific — skip the match entirely.
const DE_ARTICLE_GATED = new Set(["herr", "herrn", "frau"]);
const DE_DETERMINERS = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem",
  "einen", "kein", "keine", "meine", "seine", "ihre", "unsere", "eure",
  "diese", "dieser", "dieses", "jene", "jede", "jeder", "junge", "alte", "andere",
]);

// English role words a title can precede ("mr president") — the FR equivalents
// (président, directeur…) are already GENERIC_TERMS entries.
const ROLE_WORDS = new Set([
  "president", "director", "minister", "mayor", "judge", "doctor",
  "professor", "secretary", "chairman", "officer",
]);

// NAME PARTICLES — the nobiliary/patronymic joiners ("EL AMRANI", "VAN DER MEER", "de la
// Fontaine"). `okToken` rejects them (2 chars or a stopword), so they are consumed as
// JOINERS only: kept solely when a real name token follows, so a trailing "de" can never
// end a value (and `isNamePart` still forbids aliasing one on its own).
const NAME_PARTICLES = new Set([
  "de", "du", "des", "la", "le", "les", "d", "l",
  "van", "von", "der", "den", "ter", "ten", "te",
  "da", "das", "do", "dos", "di", "del", "della", "dello", "degli", "delle",
  "el", "al", "ben", "bin", "ibn", "bint", "ould", "abu", "abd",
  "mac", "mc", "o", "san", "santa", "saint", "sainte", "st",
  "af", "av", "zu", "zum", "op", "in",
]);
export const isParticle = (tok: string): boolean =>
  NAME_PARTICLES.has(tok.replace(/[.'’]/g, "").toLowerCase());

// ACADEMIC-TITLE CONTINUATIONS — the DOTTED discipline word of a doctorate ("Dr. med.",
// "Dr. rer. nat.", "Dr.-Ing."), consumed as part of the TITLE: left unconsumed, "med" is the
// match's first token and the real name two tokens later is never proposed (a false
// positive that hides a miss — `honorifics.test.ts`). The DOT is required: an undotted
// "Ing" is an ordinary capitalised word.
const TITLE_CONTINUATIONS = ["med", "phil", "rer", "nat", "jur", "habil", "ing", "sc"];

const byLengthDesc = (a: string, b: string): number => b.length - a.length;
// ≥3 chars, letters with inner apostrophe/hyphen, ends on a letter.
const TOKEN = "\\p{L}[\\p{L}'’-]*\\p{L}";
const RE = new RegExp(
  `(?<![\\p{L}.'’-])(?:(${[...BARE_TITLES, ...CASED_TITLES].sort(byLengthDesc).join("|")})\\.?|(${[...DOTTED_TITLES].sort(byLengthDesc).join("|")})\\.)` +
    // …optionally followed by its DOTTED academic continuations. The hyphen arm is the
    // German "Dr.-Ing." welding, which no whitespace class would reach.
    `(?:[^\\S\\r\\n]{0,2}-?(?:${TITLE_CONTINUATIONS.sort(byLengthDesc).join("|")})\\.)*` +
    // 1-2 spaces, never a RUN: 3+ is the COLUMN GUTTER of a form line (« ☐ Mme        Nom »).
    `[^\\S\\r\\n]{1,2}` +
    // INITIALS (group 3), optional: « Mr C. Whomersley », and the anonymised court form
    // « Mrs G. » where the initial IS the whole name (`TOKEN` needs two letters and no dot).
    // Dotted initials may precede a surname; a BARE capital may only stand alone, never
    // « A » or « I ». Trailing whitespace is captured WITH the group for the offset arithmetic.
    `((?:\\p{Lu}\\.[^\\S\\r\\n]{0,2})+|(?<![\\p{L}])[B-HJ-Z](?![\\p{L}'’.-])[^\\S\\r\\n]{0,2})?` +
    // …the name (group 4), optional so « Mrs G. » closing a sentence still matches.
    `(${TOKEN}(?:[^\\S\\r\\n]{1,2}${TOKEN}){0,4})?`,
  "giu",
);

// The honorific GLUED by OCR — « MonsieurMaxime OZERAY », « MmeVIDALENC ». ⚠️ A SEPARATE
// regex WITHOUT the `i` flag: under `iu`, \p{Lu}/\p{Ll} FOLD by case, so a
// « lowercase→UPPERCASE » boundary would constrain nothing (« FRAUEN » split into FRAU+EN).
// The casing is carried by the alternation: TITLE-CASE titles followed by an UPPERCASE letter.
const GLUED_TITLES = [
  "Monsieur", "Madame", "Mademoiselle", "Mme", "Mlle",
  "Maître", "Maitre", "Docteur", "Professeur", "Mr", "Mrs", "Dr", "Prof",
];
const RE_GLUED = new RegExp(
  // Same groups as RE (1 = title, 2 = unused, 3 = initials — empty here, 4 = name).
  `(?<![\\p{L}.'’-])(${GLUED_TITLES.sort(byLengthDesc).join("|")})()()` +
    `(?=\\p{Lu})(${TOKEN}(?:[^\\S\\r\\n]{1,2}${TOKEN}){0,4})`,
  "gu", // NEVER `i`: it's the absence of case folding that gives all the precision.
);

/** True when the word right before `idx` is a German determiner/adjective. */
function precededByGermanDeterminer(text: string, idx: number): boolean {
  let end = idx;
  while (end > 0 && /[ \t]/.test(text[end - 1])) end--;
  let start = end;
  while (start > 0 && /[\p{L}]/u.test(text[start - 1])) start--;
  return start < end && DE_DETERMINERS.has(text.slice(start, end).toLowerCase());
}

function okToken(tok: string, requireCased: boolean): boolean {
  if (tok.length < 3 || /\d/.test(tok)) return false;
  if (requireCased && !/^\p{Lu}/u.test(tok)) return false;
  // A French inversion tail ("veut-il", "a-t-elle") is a verb, never a name.
  if (/-(?:je|tu|il|elle|on|nous|vous|ils|elles|t-il|t-elle|t-on|ce)$/iu.test(tok)) return false;
  const lower = tok.toLowerCase();
  if (TITLE_WORDS.has(lower) || ROLE_WORDS.has(lower)) return false;
  return !isStopword(tok) && !isGenericTerm(tok) && !isCountry(tok);
}

/**
 * Detect person names introduced by an honorific. Returns verbatim
 * `{value, category: "NAME"}` detections — the title itself stays in clear.
 * The FIRST token decides the match; further tokens are appended only while Capitalized in
 * the original ("Monsieur Julien Louis SABOURDIN" → all three; "madame keller demain" →
 * "keller" only, an uncased following word is prose). The value slices the captured text,
 * so original spacing is preserved verbatim.
 */
export function detectHonorificNames(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  // Two passes, one loop: the spaced form, then the form GLUED by OCR
  // (RE_GLUED — its case safety is explained on the spot). Each pass clones its
  // regex: RE/RE_GLUED are shared at module scope, their lastIndex must not be.
  for (const source of [RE, RE_GLUED]) {
  const re = new RegExp(source.source, source.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const title = (m[1] ?? m[2] ?? "").toLowerCase();
    if (DE_ARTICLE_GATED.has(title) && precededByGermanDeterminer(text, m.index)) continue;
    const initials = m[3] ?? "";
    const captured = m[4] ?? "";
    const start = m.index + m[0].length - captured.length;
    const initialsAt = start - initials.length; // they sit right before the name
    const parts = captured.split(/([^\S\r\n]+)/); // even = token, odd = separator
    const tokens = parts.filter((_, i) => i % 2 === 0);
    if (!captured || !okToken(tokens[0], CASED_SET.has(title))) {
      // No acceptable name — but INITIALS: « Mrs G. and », « Sergeant H was ». In an
      // anonymised ruling the initial is the whole identifying residue, and the title is
      // what makes a lone capital a person rather than a letter.
      if (initials.trim()) {
        const value = initials.trimEnd();
        re.lastIndex = initialsAt + value.length;
        if (!seen.has(value)) {
          seen.add(value);
          out.push({ value, category: "NAME", start: initialsAt });
        }
        continue;
      }
      if (!captured) continue;
      // REJECTED first token ("M. et …") — resume right after it, not after the greedy
      // capture, whose tail may hold the NEXT honorific ("M. et Mme SABOURDIN"). EXCEPT when
      // the rejected token is ITSELF a title: titles STACK ("Prof. Dr. med. habil. X"), so
      // resume AT it. Terminating: `start` is strictly greater than this match's index.
      if (tokens[0]) {
        const inner = TITLE_WORDS.has(tokens[0].toLowerCase());
        re.lastIndex = inner ? start : start + tokens[0].length;
      }
      continue;
    }
    let keep = 1;
    while (keep < tokens.length) {
      if (okToken(tokens[keep], true)) {
        keep++;
        continue;
      }
      // A PARTICLE is consumed only WITH the name token that follows it, so the value
      // never ends on a joiner ("Nadia EL" would alias a bare "EL"). Case-free: deeds
      // write "EL AMRANI" and "de la Fontaine" alike.
      if (
        isParticle(tokens[keep]) &&
        keep + 1 < tokens.length &&
        (okToken(tokens[keep + 1], true) || isParticle(tokens[keep + 1]))
      ) {
        keep++;
        continue;
      }
      break;
    }
    // A value may not END on a particle (a run of them was consumed but no name
    // followed) — walk back to the last real token.
    while (keep > 1 && isParticle(tokens[keep - 1])) keep--;
    // A LOWERCASE surname may follow a KNOWN first name — French legal prose writes
    // parties fully lowercase ("monsieur lucas ferrand, ci-après « le bailleur »"). The
    // first-name lexicon is the gate: "keller" is not a first name, so "demain" is never
    // appended. Only when nothing cased followed.
    if (
      keep === 1 &&
      keep < tokens.length &&
      // Lowercase prose ONLY: « Dr Darnell gave evidence » must not make « gave » a surname.
      !/^\p{Lu}/u.test(tokens[0]) &&
      FIRST_NAMES.has(tokens[0].normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase())
    ) {
      // Lowercase legal prose: "monsieur julien de la fontaine" — cross the particles
      // to reach the surname, then keep appending while tokens qualify uncased.
      while (keep < tokens.length && (okToken(tokens[keep], false) || isParticle(tokens[keep]))) {
        keep++;
      }
      while (keep > 1 && isParticle(tokens[keep - 1])) keep--;
    }
    let value = parts.slice(0, 2 * keep - 1).join("");
    let at = start;
    if (initials) {
      // « Mr C. Whomersley » is one person: the initial travels with the surname.
      value = initials + value;
      at = initialsAt;
    }
    // Resume the scan right AFTER the kept value: the greedy 3-token capture may
    // have swallowed the NEXT honorific ("mr welby and mrs blackwood" captured
    // "welby and mrs"), which would orphan its name from detection entirely.
    re.lastIndex = at + value.length;
    if (source === RE_GLUED) {
      // GLUED form: the value INCLUDES the fused title. The vault never rewrites a fragment
      // inside a word (`isWordGlued`), so a « Maxime » emitted alone would be DETECTED but
      // NEVER replaced. The title lost in the fake costs nothing; restitution renders the
      // original fused down to the character.
      value = text.slice(m.index, at + value.length);
      at = m.index;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, category: "NAME", start: at });
  }
  }
  return out;
}
