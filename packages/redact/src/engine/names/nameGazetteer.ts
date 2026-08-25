// FIRST-NAME GAZETTEER detector — deterministic person names in prose, no model.
//
// Measured gap: on the committable document corpus, the deterministic pipeline's misses
// are dominated by plain prose names ("Bernard VELINET", "Julien VIDAL", "Camille
// VERLAND") — no honorific, no label, so nothing deterministic could claim them and the
// `patterns` engine (no model) shipped them in clear.
//
// ⚠️ THE SAFETY IS THE PAIRING RULE, not the lexicon. Thousands of first names collide
// with common words (pierre, rose, claire, mark, bill, grace…), so a lone first name
// NEVER fires. A detection requires a PAIR of capitalized tokens where one side is a
// known first name and the other passes the surname gates — plus the guards below. Every
// guard exists against a named false positive:
//   • both tokens capitalized          — "Pierre tombe" / "rose des vents" never match;
//   • surname gates                    — stopwords, generic terms, countries, months
//                                        ("Jean Février" stays, "15 Juin" was never a pair);
//   • determiner guard                 — "la Rose Blanche" (a shop, not a person);
//   • street guard                     — "rue Pierre Brossolette" belongs to the address
//                                        detector, one value, not a nested name;
//   • notorious filter (downstream)    — "Emmanuel Macron" is world knowledge, spared by
//                                        `filterCandidates` like every other NAME source.
import type { Detection } from "../../types";
import { isStopword, isGenericTerm } from "../../model/detect";
import { isCountry } from "../geo/countries";
import { FIRST_NAMES } from "./firstNames.data";

/** Lookup normalization: lowercase + strip diacritics (OCR routinely drops accents). */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();

const isFirstName = (tok: string) => FIRST_NAMES.has(fold(tok));

/** Months/days in the lexicon's languages — a "surname" that is a date word is a date. */
const DATE_WORDS = new Set(
  (
    "janvier,fevrier,mars,avril,mai,juin,juillet,aout,septembre,octobre,novembre,decembre," +
    "january,february,march,april,may,june,july,august,september,october,november,december," +
    "enero,febrero,marzo,abril,mayo,junio,julio,agosto,septiembre,octubre,noviembre,diciembre," +
    "lundi,mardi,mercredi,jeudi,vendredi,samedi,dimanche,monday,tuesday,wednesday,thursday,friday,saturday,sunday"
  ).split(","),
);

/** The token immediately BEFORE the pair decides two guards. */
const DETERMINERS = new Set("le,la,les,l,un,une,des,ce,cette,ces,the,a,an,el,los,las,il,lo,della,delle".split(","));
const STREET_WORDS = new Set(
  "rue,avenue,boulevard,place,allee,impasse,quai,chemin,cours,square,passage,sentier,mail,esplanade,route,residence,lycee,college,ecole,hopital,clinique,stade,gymnase,mediatheque,bibliotheque".split(","),
);

/** A capitalized name token: Title-case or ALL-CAPS (accents included), ≥3 chars.
 *  Hyphenated compounds ride along (Jean-Pierre, SAINT-MARTIN). */
const TOKEN = String.raw`\p{Lu}[\p{L}'’-]{2,}`;
/** Name PARTICLES that may sit between given and surname ("Sanne de Vries",
 *  "Nolwenn Le Danvez", "Jean de La Fontaine") — the TOKEN floor (≥3 chars,
 *  capitalized) rejected them and the whole pair with them. They ride the PAIR
 *  only: a particle is never a given, never a surname, and the pairing rule keeps
 *  carrying the safety. "des" is deliberately absent — « Rose des Vents » is an
 *  enseigne, not a person. */
const PART = "(?:[Dd]e|[Dd]u|[Vv]an|[Vv]on|[Dd]er|[Dd]en|[Tt]e[nr]?|[Dd]a|[Dd]os|[Dd]el(?:la)?|[Dd]i|[Ll]a|[Ll]e|[Ee]l|[Aa]l)";
const PARTICLES = new Set(
  "de,du,van,von,der,den,ten,ter,te,da,dos,del,della,di,la,le,el,al".split(","),
);
const SEQ_RE = new RegExp(
  String.raw`(?<![\p{L}'’-])(${TOKEN})((?:[ \t](?:${PART}[ \t]){0,2}${TOKEN}){1,3})(?![\p{L}])`,
  "gu",
);

/** Surname plausibility — everything a capitalized token can be that is NOT a surname. */
function surnameOk(tok: string): boolean {
  const f = fold(tok);
  return !isStopword(tok) && !isGenericTerm(tok) && !isCountry(tok) && !DATE_WORDS.has(f);
}

/** "T." / "J.P." / "J.-P." — one or two dotted initials, a SPACE, then a capitalized
 *  ≥3 word. The lookbehind refuses a letter/dot before the FIRST initial, so the tail
 *  of an acronym ("S.N.C.F.") can't spawn a person from its last letter; the space is
 *  MANDATORY — dotted labels glue their word ("P.IVA", the Italian VAT header) and an
 *  OCR-glued initial is rarer than that label is common (measured on categoriesMinces). */
const INITIAL_RE = new RegExp(
  String.raw`(?<![\p{L}'’.\-])(\p{Lu}\.(?:-?\p{Lu}\.)?)[ \t](${TOKEN})(?![\p{L}])`,
  "gu",
);

/** OCR routinely GLUES the honorific onto the name ("MonsieurJulien", "MrPaul" — both
 *  measured on real scanned leases). Strip it so the given underneath can be judged. */
const GLUED_HONORIFIC = /^(?:Monsieur|Madame|Mademoiselle|Mr|Mme|Mlle|Dr)(\p{Lu}[\p{L}'’-]+)$/u;

/** Every token of a hyphenated given ("Jean-Pierre") must itself be a known name. */
function givenOk(tok: string): boolean {
  const bare = tok.match(GLUED_HONORIFIC)?.[1] ?? tok;
  const parts = bare.split(/[-’']/).filter(Boolean);
  return parts.length > 0 && parts.every((p) => p.length >= 2 && isFirstName(p));
}

export function detectGazetteerNames(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  // exec-loop, not matchAll: a sequence the CLASSIFICATION rejects must not swallow
  // the name inside it. The particle arm lets "Signature de Helene Vernaux" start on
  // "Signature"; when that lead fails as a given, the scan RESUMES right after the
  // first token so "Helene Vernaux" gets its own match. Rejections by the
  // determiner/street guard keep consuming (their pinned semantics predate this).
  SEQ_RE.lastIndex = 0;
  for (let m = SEQ_RE.exec(text); m; m = SEQ_RE.exec(text)) {
    const retry = m.index + m[1].length;
    const tokens = [m[1], ...m[2].trim().split(/[ \t]+/)];
    // English genitive rides the last token ("Paul-Émile Mvele's file") — strip it so
    // the vaulted value is the NAME the truth carries, not name + clitic (the fake then
    // slots in front of the surviving "'s" naturally).
    const last = tokens.length - 1;
    tokens[last] = tokens[last].replace(/['’]s$/, "");
    if (tokens[last].length < 3) {
      SEQ_RE.lastIndex = retry;
      continue;
    }
    // The word before the sequence: a determiner names a THING, a street word an address.
    // Determiners keep their ACCENTS (folding read the French preposition « à » as the
    // English article "a" and suppressed every « remis à Prénom Nom »); street words fold
    // (OCR drops accents — "allée"/"allee" are the same street).
    const before = text.slice(Math.max(0, m.index - 24), m.index).match(/([\p{L}'’]+)['’ \t]*$/u)?.[1];
    if (before && (DETERMINERS.has(before.toLowerCase()) || STREET_WORDS.has(fold(before)))) continue;

    // Shape A — given name(s) first, then 0-2 PARTICLES, surname last: "Julien VIDAL",
    // "Julien Louis Corbel", "Sanne de Vries", "Jean de La Fontaine".
    const isParticle = (t: string) => PARTICLES.has(fold(t));
    const givens = (() => {
      let i = 0;
      while (i < tokens.length - 1 && !isParticle(tokens[i]) && givenOk(tokens[i])) i++;
      return i;
    })();
    const afterParts = (() => {
      let i = givens;
      while (i < tokens.length - 1 && isParticle(tokens[i])) i++;
      return i;
    })();
    const shapeA =
      givens > 0 &&
      afterParts === tokens.length - 1 &&
      !isParticle(tokens[afterParts]) &&
      surnameOk(tokens[afterParts]);
    // Shape B — French admin order, surname (ALL-CAPS) first: "VELINET Bernard".
    const shapeB =
      !shapeA &&
      tokens.length === 2 &&
      /^\p{Lu}[\p{Lu}'’-]+$/u.test(tokens[0]) &&
      surnameOk(tokens[0]) &&
      givenOk(tokens[1]);
    if (!shapeA && !shapeB) {
      SEQ_RE.lastIndex = retry;
      continue;
    }

    const value = tokens.map((t) => t.match(GLUED_HONORIFIC)?.[1] ?? t).join(" ");
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, category: "NAME", start: m.index });
  }
  // « Initiale. NOM » — "T. SABOURDIN", "J.-P. Vidal". No lexicon can say, in every
  // language, that the word after the initial IS a surname — so the shape ships
  // flagged `uncertain`: masked by default, « à vérifier » in the pre-send audit,
  // one click to keep in clear (the item-2 outlet — language-neutral where a
  // French-only surname lexicon would not be). The negative guards do the coarse
  // work: a generic/stopword/country/date word after the initial is a heading
  // ("B. Introduction", "C. Conclusion"), never a person.
  for (const m of text.matchAll(INITIAL_RE)) {
    const surname = m[2].replace(/['’]s$/, "");
    if (surname.length < 3 || !surnameOk(surname)) continue;
    const value = m[0].replace(/['’]s$/, "");
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, category: "NAME", start: m.index, uncertain: true });
  }
  return out;
}
