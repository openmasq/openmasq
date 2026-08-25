// The STATE-INSTITUTION half of the notoriety gate + the shared `norm` folding —
// split out of `notorious.ts` (rule 1: the file crossed the 300-LOC cap when this
// machinery landed). Same allow-list discipline; `notorious.ts` is the sole consumer.
import { isCountry } from "../engine/geo/countries";

/** lowercase + accents stripped + delimiters removed — one entry covers "Napoléon",
 *  "napoleon", "NAPOLEON" and dotted/spaced forms ("J.F. Kennedy" ≠ though: entries are
 *  stored ALREADY normalised, multi-word forms glue their words). */
export const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.\s_'’-]+/g, "");

// ── STATE-INSTITUTION phrases (« gouvernement français », "German parliament") ────
// "composition du gouvernement français actuel" is a general-knowledge question, and the
// NER tags « gouvernement français » ORG — faked, the model answered about a nonsense
// token. The institution-of-a-country is world knowledge, exactly like the country
// itself. Recognition = every token is a STOPWORD, an INSTITUTION word, a DEMONYM or a
// COUNTRY, with at least ONE institution word present.
//
// ⚠️ The demonyms are deliberately HERE and not in `genericTerms` — « française » as a
// generic word would combine with the already-generic « société » and DROP the span
// "Société Française …", the start of countless real company names: a leak. Behind the
// institution-word requirement, "Société Française" cannot qualify (no institution word).
const INSTITUTION_WORDS = new Set([
  "gouvernement", "gouvernements", "government", "governments",
  "parlement", "parliament", "senat", "senate", "congres", "congress",
  "ministere", "ministeres", "ministry", "ministries",
  "republique", "republic", "administration", "ambassade", "embassy",
  "consulat", "consulate", "assemblee",
]);
const DEMONYMS = new Set([
  // FR adjectives (masc/fem/plural fold via norm) + EN adjectives, major countries.
  "francais", "francaise", "francaises", "americain", "americaine", "americains",
  "americaines", "britannique", "britanniques", "allemand", "allemande", "allemands",
  "allemandes", "espagnol", "espagnole", "espagnols", "espagnoles", "italien",
  "italienne", "italiens", "italiennes", "europeen", "europeenne", "europeens",
  "europeennes", "russe", "russes", "chinois", "chinoise", "chinoises", "japonais",
  "japonaise", "japonaises", "canadien", "canadienne", "canadiens", "canadiennes",
  "belge", "belges", "suisse", "suisses", "portugais", "portugaise", "neerlandais",
  "neerlandaise", "ukrainien", "ukrainienne", "israelien", "israelienne", "indien",
  "indienne", "bresilien", "bresilienne", "mexicain", "mexicaine", "polonais",
  "polonaise", "turc", "turque", "iranien", "iranienne", "coreen", "coreenne",
  "national", "nationale", "nationaux", "nationales", "federal", "federale",
  "french", "american", "british", "german", "spanish", "italian", "european",
  "russian", "chinese", "japanese", "canadian", "belgian", "swiss", "portuguese",
  "dutch", "ukrainian", "israeli", "indian", "brazilian", "mexican", "polish",
  "turkish", "iranian", "korean",
]);
const STATE_STOP = new Set(["le", "la", "les", "du", "de", "des", "the", "of", "l", "d"]);

/** « gouvernement français », "the German parliament" — a state institution, world
 *  knowledge. Every token covered, ≥1 institution word. Accent/case-folded via `norm`
 *  per token (NOT the glued whole — token identity is what carries the precision). */
export function isStateInstitution(value: string): boolean {
  const tokens = value.split(/[\s'’-]+/u).filter(Boolean).map((t) => norm(t));
  if (tokens.length < 1 || tokens.length > 5) return false;
  let institution = false;
  for (const t of tokens) {
    if (INSTITUTION_WORDS.has(t)) institution = true;
    else if (!DEMONYMS.has(t) && !STATE_STOP.has(t) && !isCountry(t)) return false;
  }
  return institution;
}

