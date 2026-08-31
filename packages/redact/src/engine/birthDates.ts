// Prose BIRTH DATES — the civil-status line every French deed/état-civil document
// carries: "Né à RENNES (35000) le 23 septembre 1996.", "née le 05/07/1990". The
// labeled-field detector needs a COLON so it never sees this prose form, and no date
// rule fires bare (a date is not PII by shape) — so the birth CITY was faked while
// the birth DATE shipped in clear, an identifying pair. OCR gluing is tolerated
// ("Néà RENNES", "le5 juillet 1990"). Only the DATE is emitted (category DOB → a
// valid same-format fake date); the birthplace is the geo detectors' span.
import type { Detection } from "../types";

const MONTH =
  "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const DATE = `(?:\\d{1,2}(?:er)?\\s*(?:${MONTH})\\s*\\d{4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`;
// The intl month names (it/es/pt/de/en) + the numeric forms, for `BIRTH_INTL_RE`.
const MONTH_INTL =
  "gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre" +
  "|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre" +
  "|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro" +
  "|januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember" +
  "|january|february|march|april|may|june|july|august|september|october|november|december";
// `\.?` after the day: the GERMAN ordinal dot (« geboren am 4. Juli 1968 ») — without
// it both German textual dates of the corpus shipped in clear beside a faked name.
const DATE_INTL = `(?:\\d{1,2}\\.?(?:\\s*de)?\\s*(?:${MONTH_INTL})(?:\\s*de)?\\s*\\d{4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`;

// "né(e)(à)" then an optional bounded birthplace infix (same line, no sentence end)
// then "le" (possibly glued to the day) then the date. The infix is lazy and capped
// so an unrelated later date in the paragraph can never be pulled in.
// The same civil-status shape in the other contract languages the product covers —
// "nato a Napoli il 21/07/1980", "nacido en Sevilla el 3 de mayo de 1975", "geboren am
// 14.06.1975", "nascido em Lisboa a 2 de janeiro de 1988", "born on 5 May 1990". The
// FR-only anchor left every foreign contract's birth date in CLEAR beside a faked name
// and a faked birthplace — the identifying pair the FR branch exists to break.
// Forms that NAME the birth date without the verb « naître » — measured on a
// manual bench: « Son anniversaire est le 3 juillet 1992 » and « date de naissance :
// … » (without a colon) were going out in clear, while « né le … » was protected.
// A birthday date IS a birth date; it's the same data.
const BIRTH_WORD_INTL =
  "nat[oa]|nacid[oa]|nascid[oa]|geboren|born|anniversaire|date de naissance|birthday|birth date|date of birth|geburtsdatum|fecha de nacimiento|data di nascita|data de nascimento";
const BIRTH_INTL_RE = new RegExp(
  `\\b(?:${BIRTH_WORD_INTL})\\b(?:[^\\n.]{0,40}?)?[^\\S\\r\\n]*(?:est|is|ist)?[^\\S\\r\\n]*(?:il|el|am|a|on|le)?[^\\S\\r\\n]*(${DATE_INTL})`,
  "giu",
);

const BIRTH_RE = new RegExp(
  // « anniversaire » / « date de naissance » join « né(e) »: the INTL branch doesn't
  // cover FRENCH months, so « Son anniversaire est le 3 juillet 1992 »
  // was falling between the two detectors.
  `\\b(?:n[ée](?:e|[àa]|e[àa])?|anniversaire|date de naissance)\\s*(?:[àa]\\s+)?(?:[^\\n.]{0,60}?\\s)?(le\\s*${DATE})`,
  "giu",
);

// The INVERSE order — "née le 17 mai 1988 à Villeurbanne" (date first, city after) —
// leaves the birth CITY with no detector: the labeled-fields need a colon, the notarial
// shape needs its parenthesised CP, and the date-first order keeps the city OUT of the
// birth infix above. The birth phrase is the precision gate (same discipline as every
// context gate): only a Capitalized run right after "<birth date> à " is a birthplace.
const BIRTH_CITY_RE = new RegExp(
  `\\bn[ée](?:e|[àa]|e[àa])?\\s*le\\s*${DATE}\\s*[àa]\\s+(\\p{Lu}[\\p{L}'’-]*(?:[ -]\\p{Lu}[\\p{L}'’-]*){0,3})`,
  "giu",
);

/** Detect prose civil-status birth dates ("Né à … le 23 septembre 1996"). */
export function detectBirthDates(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(BIRTH_CITY_RE)) {
    const city = (m[1] ?? "").trim();
    if (city && !seen.has(city)) {
      seen.add(city);
      out.push({ value: city, category: "CITY", start: m.index });
    }
  }
  for (const m of text.matchAll(BIRTH_INTL_RE)) {
    const value = (m[1] ?? "").trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push({ value, category: "DOB", start: m.index });
    }
  }
  for (const m of text.matchAll(BIRTH_RE)) {
    // A separated "le 23 septembre 1996" emits the DATE alone; the OCR-glued
    // "le5 juillet 1990" keeps its "le" IN the value — the bare date would be
    // word-glued in the text, which `applyVault` (rightly) refuses to substitute
    // inside, so the vaulted date would ship in clear. `fakeDate` preserves the
    // non-digit prefix, so the fake stays in-place readable ("le3 juillet 1957").
    const raw = (m[1] ?? "").trim();
    const value = /^le\s/.test(raw) ? raw.replace(/^le\s+/, "") : raw;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, category: "DOB", start: m.index });
  }
  out.push(...detectActDates(text));
  return out;
}

/**
 * The date of a DEED tied to named people — « reçu le 12/03/2024 », « prise
 * d'effet le 01/07/2025 », « à compter du 01/09/2021 », « employé du … au … », « célébré
 * le 27/05/2017 ».
 *
 * Why it was missing: the detector above is gated by BIRTH context,
 * and no rule fires on a bare date — deliberately, else every log
 * timestamp and every invoice date would be redacted. Result measured on the bench: on a
 * lease, an employment contract, a marriage deed or a consultation report, the
 * parties were redacted and the date tying them together went out in clear. Yet it's the
 * pair that re-identifies: « embauché le 01/09/2021 » narrows an employee down to a few
 * people.
 *
 * ⚠️ The gate is the VERB, not the date. An ALLOW-list of deed participles,
 * followed by its article, exactly like the identifier track (the label carries the
 * value). What it deliberately refuses: « facture du 12/03/2024 », « exporté le … »,
 * « 12/03/2024 10:04:22 » in a log — a deed, not a timestamp.
 */
const ACT_VERB =
  "re[çc]u|sign[ée]e?s?|[ée]tabli[es]?|conclu[es]?|c[ée]l[ée]br[ée]e?|immatricul[ée]e?|" +
  "embauch[ée]e?|employ[ée]e?|enregistr[ée]e?|d[ée]pos[ée]e?|r[ée]uni[es]?|" +
  "prise? d'effet|entr[ée]e? en vigueur|dat[ée]e?|renouvel[ée]e?|r[ée]sili[ée]e?|" +
  "fix[ée]e?|remis[es]?|nomm[ée]e?|mut[ée]e?|admis[es]?|inscrit[es]?";
/** « à compter du », « avec effet au »: the lead-in already carries the article. */
const ACT_LEAD = "[àa] compter|avec effet|jusqu'au|depuis le";
/** ⚠️ A deed date requires its SEPARATORS, where `DATE` tolerates OCR gluing:
 *  « signé le20juin2024 » is agglutinated prose, not a dated signature, and
 *  `gluedProse.test.ts` pins that it stays in clear. The verb guards the date; the
 *  separator guards the verb. */
const ACT_DATE =
  `(?:\\d{1,2}(?:er)?[^\\S\\r\\n]+(?:${MONTH})[^\\S\\r\\n]+\\d{4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`;
// ⚠️ `\b` is ASCII in JS: « employ**é** » has no boundary after its accent, and
// « **é**tabli » has none before it — neither verb was ever firing. Unicode
// boundaries on both sides (the trap `engine/CLAUDE.md` documents for `gate()`).
// The article carries the same boundary, else « établi **les** statuts » consumes the « le » of
// « les » and the rule fails right after.
const NOT_L = "(?![\\p{L}])";
const ACT_RE = new RegExp(
  `(?<![\\p{L}])(?:(?:${ACT_VERB})${NOT_L}[^\\S\\r\\n]*(?:[^\\S\\r\\n]*[\\p{L}']{1,12}){0,2}[^\\S\\r\\n]*` +
    `(?:le|du|au|en date du|à compter du)${NOT_L}|(?:${ACT_LEAD})${NOT_L})` +
    `[^\\S\\r\\n]*(?:(?:le|du|au)${NOT_L})?[^\\S\\r\\n]*(${ACT_DATE})`,
  "giu",
);
/** The SECOND term of an interval (« du 03/01/2018 au 30/04/2024 »): the first date
 *  is caught by the rule above, the second only has « au » before it. */
const ACT_RANGE_RE = new RegExp(`(?:${ACT_DATE})[^\\S\\r\\n]*(?:au|jusqu'au|-|–)[^\\S\\r\\n]*(${ACT_DATE})`, "giu");
/** LONG RANGE — the same deed verb, but 3 to 8 words before the date (« ont établi
 *  les statuts de la SCI LES TROIS TILLEULS le 22/09/2023 »): the short range
 *  above stops at 2 words and left the incorporation date in clear. The longer
 *  the window stretches, the more the verb's authority dilutes — so the detection comes out
 *  FLAGGED "to verify" (masked by default, unmaskable with one click), instead
 *  of demanding a precision from the short regex that it doesn't have at this distance. */
const ACT_RE_FAR = new RegExp(
  `(?<![\\p{L}])(?:${ACT_VERB})${NOT_L}(?:[^\\S\\r\\n]+[\\p{L}''-]{1,15}){3,8}[^\\S\\r\\n]+` +
    `(?:le|du|en date du)${NOT_L}[^\\S\\r\\n]*(${ACT_DATE})`,
  "giu",
);
/** The notarial closing « Fait à VILLE, le 22/09/2023 » — « fait » is too common to
 *  join ACT_VERB (« il l'a fait le … »), but ANCHORED on « à + capitalized City »,
 *  the form is unambiguous; only the DATE is emitted (the city belongs to geo). */
const ACT_FAIT_RE = new RegExp(
  `(?<![\\p{L}])[Ff]aits?[^\\S\\r\\n]+[àa][^\\S\\r\\n]+\\p{Lu}[\\p{L}'’-]*(?:[ -]\\p{Lu}[\\p{L}'’-]*){0,3}[^\\S\\r\\n]*,?[^\\S\\r\\n]*le[^\\S\\r\\n]*(${ACT_DATE})`,
  "gu",
);

function detectActDates(text: string): Detection[] {
  const out: Detection[] = [];
  const seen = new Set<string>();
  const add = (value: string, start: number, uncertain?: boolean): void => {
    const v = value.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(uncertain ? { value: v, category: "DATE", start, uncertain } : { value: v, category: "DATE", start });
  };
  for (const m of text.matchAll(ACT_RE)) add(m[1] ?? "", m.index);
  for (const m of text.matchAll(ACT_FAIT_RE)) add(m[1] ?? "", m.index);
  // Long range AFTER the short one: a date already caught by the short arm keeps its
  // clean detection (value-based dedup is authoritative), the flag is only added
  // to dates that ONLY the wide window reaches.
  for (const m of text.matchAll(ACT_RE_FAR)) add(m[1] ?? "", m.index, true);
  // The interval is only followed if it OPENS onto a deed date: without this bound,
  // two neighbouring timestamps would be enough to trigger.
  for (const m of text.matchAll(ACT_RANGE_RE)) {
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    if (new RegExp(`(?:${ACT_VERB})(?![\\p{L}])[^\\S\\r\\n]*(?:le|du|au)?[^\\S\\r\\n]*$`, "iu").test(before))
      add(m[1] ?? "", m.index);
  }
  return out;
}
