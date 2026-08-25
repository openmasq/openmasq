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
import type { Detection } from "../types";
import { isStopword, isGenericTerm } from "../model/genericTerms";
import { isCountry } from "./geo/countries";
import { FIRST_NAMES } from "./names/firstNames.data";

const BARE_TITLES = [
  "monsieur", "madame", "mademoiselle", "mme", "mlle",
  "maître", "maitre", "docteur", "professeur",
  "mr", "mrs", "dr", "prof",
];

const DOTTED_TITLES = ["m", "pr", "sr", "sra", "srta", "sig", "dott", "dra"];

const CASED_TITLES = [
  "herr", "herrn", "frau",
  "señor", "señora", "señorita", "doña", "don",
  "signor", "signore", "signora", "signorina",
  "dottor", "dottore", "dottoressa",
  "senhor", "senhora",
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

// NAME PARTICLES — the nobiliary/patronymic joiners. A surname built on one
// ("EL AMRANI", "VAN DER MEER", "DA SILVA", "de la Fontaine", "BEN SALAH",
// "OULD SLIMANE") used to STOP the continuation dead: the particle is 2 chars or a
// stopword, so `okToken` rejected it and only the FIRST NAME was redacted — the
// identifying half shipped in clear. They are consumed as JOINERS only: a particle
// is kept solely when a real name token follows it, so a trailing "de" can never
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

// ACADEMIC-TITLE CONTINUATIONS — the DOTTED discipline word of a German/Latin doctorate
// ("Dr. med.", "Dr. phil.", "Dr. rer. nat.", "Dr.-Ing."). Consumed as part of the TITLE,
// never as its name.
//
// ⚠️ Not merely a precision fix. Left unconsumed, "med" IS the match's first token, so the
// detector emitted « med » AND STOPPED — the physician's real name two tokens later
// ("Dr. med. Hendrik WALDHOFF-ARNDT") was never proposed at all. A false positive that
// hides a miss. Both halves are pinned in `honorifics.test.ts`.
//
// The trailing DOT is required, exactly like `DOTTED_TITLES`: an undotted "Med"/"Ing" is
// an ordinary capitalised word, and swallowing it would eat a real surname.
const TITLE_CONTINUATIONS = ["med", "phil", "rer", "nat", "jur", "habil", "ing", "sc"];

const byLengthDesc = (a: string, b: string): number => b.length - a.length;
// ≥3 chars, letters with inner apostrophe/hyphen, ends on a letter.
const TOKEN = "\\p{L}[\\p{L}'’-]*\\p{L}";
const RE = new RegExp(
  `(?<![\\p{L}.'’-])(?:(${[...BARE_TITLES, ...CASED_TITLES].sort(byLengthDesc).join("|")})\\.?|(${[...DOTTED_TITLES].sort(byLengthDesc).join("|")})\\.)` +
    // …optionally followed by its DOTTED academic continuations. The hyphen arm is the
    // German "Dr.-Ing." welding, which no whitespace class would reach.
    `(?:[^\\S\\r\\n]{0,2}-?(?:${TITLE_CONTINUATIONS.sort(byLengthDesc).join("|")})\\.)*` +
    // 1-2 spaces, never a RUN: 3+ is the COLUMN GUTTER of a form line, and crossing it
    // read a checkbox label as a person (« ☐ Mme        Nom : … » → the person « Nom »,
    // whose fake then replaced the word « Nom » throughout the conversation).
    `[^\\S\\r\\n]{1,2}(${TOKEN}(?:[^\\S\\r\\n]{1,2}${TOKEN}){0,4})`,
  "giu",
);

// L'honorifique COLLÉ par l'OCR — « MonsieurMaxime OZERAY », « MmeVIDALENC » : zéro
// espace, et l'identité entière partait EN CLAIR pendant que les noms espacés du même
// acte étaient masqués (bail scanné, 14/08). ⚠️ Une regex À PART, SANS le drapeau `i`,
// et ce n'est pas un détail : sous `iu`, \p{Lu}/\p{Ll} se REPLIENT par casse, donc une
// frontière « minuscule→MAJUSCULE » dans RE ne contraindrait rien (« FRAUEN » splittait
// en FRAU+EN). Ici la casse est portée par l'alternance elle-même : titres en casse de
// titre uniquement, suivis d'une MAJUSCULE — « monsieurthomas » et les pluriels
// allemands tout-en-capitales ne peuvent pas matcher par construction.
const GLUED_TITLES = [
  "Monsieur", "Madame", "Mademoiselle", "Mme", "Mlle",
  "Maître", "Maitre", "Docteur", "Professeur", "Mr", "Mrs", "Dr", "Prof",
];
const RE_GLUED = new RegExp(
  // Mêmes groupes que RE (1 = titre, 2 = inutilisé, 3 = capture) : la boucle est partagée.
  `(?<![\\p{L}.'’-])(${GLUED_TITLES.sort(byLengthDesc).join("|")})()` +
    `(?=\\p{Lu})(${TOKEN}(?:[^\\S\\r\\n]{1,2}${TOKEN}){0,4})`,
  "gu", // JAMAIS `i` : c'est l'absence de repli de casse qui fait toute la précision.
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
 * The FIRST token decides the match; up to TWO more tokens are appended, each only
 * while Capitalized in the original ("Monsieur Julien Louis SABOURDIN" → all
 * three — a 2-token cap left the SURNAME of a "first middle LAST" civil-status
 * line in clear, and the person later re-detected from a shorter form got a
 * SECOND identity; the lowercase "madame keller demain" still yields "keller"
 * only — an uncased following word is prose). The value slices the captured text,
 * so original spacing is preserved verbatim.
 */
export function detectHonorificNames(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  // Deux passes, une boucle : la forme espacée, puis la forme COLLÉE par l'OCR
  // (RE_GLUED — sa sûreté de casse est expliquée sur place). Chaque passe clone sa
  // regex : RE/RE_GLUED sont partagées au module, leur lastIndex ne doit pas l'être.
  for (const source of [RE, RE_GLUED]) {
  const re = new RegExp(source.source, source.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const title = (m[1] ?? m[2] ?? "").toLowerCase();
    if (DE_ARTICLE_GATED.has(title) && precededByGermanDeterminer(text, m.index)) continue;
    const captured = m[3] ?? "";
    const start = m.index + m[0].length - captured.length;
    const parts = captured.split(/([^\S\r\n]+)/); // even = token, odd = separator
    const tokens = parts.filter((_, i) => i % 2 === 0);
    if (!tokens.length || !okToken(tokens[0], CASED_SET.has(title))) {
      // REJECTED first token ("M. et …") — resume right after it, not after the
      // full greedy capture: the swallowed tail may hold the NEXT honorific
      // ("M. et Mme SABOURDIN" — skipping to the capture's end orphaned "Mme").
      //
      // …EXCEPT when the rejected token is ITSELF a title: titles STACK ("Prof. Dr. med.
      // habil. Sabine BRENNEKE"), so resume AT it and let it match as the title on the
      // next pass. Resuming after it consumed the only anchor and the name was lost.
      // Terminating: `start` is strictly greater than this match's index.
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
    // parties fully lowercase ("monsieur lucas ferrand, ci-après « le bailleur »"),
    // and the cased-only continuation kept "lucas" but LEAKED "ferrand". The
    // first-name lexicon is the gate (the gazetteer's own pairing logic): "madame
    // keller demain" is unchanged — "keller" is not a first name, so "demain" can
    // never be appended. ONE token only, and only when nothing cased followed.
    if (
      keep === 1 &&
      keep < tokens.length &&
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
    // Resume the scan right AFTER the kept value: the greedy 3-token capture may
    // have swallowed the NEXT honorific ("mr welby and mrs blackwood" captured
    // "welby and mrs"), which would orphan its name from detection entirely.
    re.lastIndex = start + value.length;
    let at = start;
    if (source === RE_GLUED) {
      // Forme COLLÉE : la valeur INCLUT le titre soudé (« MonsieurMaxime OZERAY »
      // entier), et ce n'est pas un choix d'affichage. Le vault ne réécrit jamais un
      // fragment à l'intérieur d'un mot (`isWordGlued` — l'invariant qui protège
      // « email » de « eVoxa »), donc un « Maxime » émis seul serait DÉTECTÉ mais
      // JAMAIS remplacé : l'identité repartait en clair, détection verte à l'appui.
      // Le titre perdu dans le faux ne coûte rien (« Basile CAZENAVE » se lit) ; la
      // restitution, elle, rend l'original soudé au caractère près.
      value = text.slice(m.index, start + value.length);
      at = m.index;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, category: "NAME", start: at });
  }
  }
  return out;
}
