import type { RedactionRule } from "../../types";
import { isMrzShaped } from "../../kinds";
import { APAC_RULES } from "./rules.international.apac";
import { EUROPE_RULES } from "./rules.international.europe";
import { US_RULES } from "./rules.international.us";
import { LATAM_RULES } from "./rules.latam";

// A DATE is only sensitive when it is a DATE OF BIRTH — a blanket date rule would
// redact every timestamp in a coding chat. So the date patterns (ported from
// presidio's DateRecognizer) fire ONLY when a birth-context phrase (FR + EN + DE)
// sits just before them. Category "dob" (on by default).
// "né", "née", "nee", "né(e)" — the form an administrative sentence actually uses.
// ⚠️ The leading `\b` is load-bearing: without it `n[ée]{1,2}` matches the "née" INSIDE
// "année", and "année 2024" would be redacted as a date of birth.
// The trailing `[()le]{0,5}` arm is the OCR MANGLE of an identity document's « Né(e) le » —
// « Néle)le : », « Né(e)le: » (CNI scannée, 14/08 : la date de naissance RÉELLE partait en
// clair, le débris de lettres bloquant à la fois le connecteur et le trou `\W`). Bounded to
// the paren/l/e alphabet so it can never eat into a real word (« Nélson ») beyond what the
// date requirement then refuses.
const BORN = String.raw`\bn[ée]{1,2}(?:\(e\))?(?:[()le]{0,5})?`;
const BIRTH_PHRASE =
  String.raw`(?:${BORN}|date\s+de\s+naissance|ddn|dtn|anniversaire` +
  String.raw`|born|d\.?o\.?b\.?|date\s+of\s+birth|birthday|geboren)`;
// ⚠️ The connector belongs HERE, not to the `\W{0,15}` gap below: that gap only spans
// NON-word characters, so "né en 1988", "né un 1er avril" and "date de naissance est le
// 8 janvier 2003" never reached the date (measured — 8 of 18 forms detected). Every part
// is optional, so the bare "Né le …" this replaces still matches.
const CONNECT =
  String.raw`(?:\s+(?:est|était|etait|is|was|ist|war))?(?:\s*:)?` +
  String.raw`(?:\s+(?:le|la|en|un|vers|au|the|on|in|am))?`;
const BIRTH = `${BIRTH_PHRASE}${CONNECT}`;
// Month NAMES, longest-first inside each language so "mar" can't shadow "mars".
const MONTH =
  String.raw`(?:janvier|février|fevrier|mars|avril|juillet|juin|mai|août|aout` +
  String.raw`|septembre|octobre|novembre|décembre|decembre` +
  String.raw`|january|february|march|april|june|july|august|september|october|november|december` +
  String.raw`|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec` +
  String.raw`|januar|februar|märz|maerz|dezember|oktober)`;
const DATE_CORE =
  String.raw`(?:\d{4}-[01]\d-[0-3]\d` + // yyyy-mm-dd (ISO)
  String.raw`|[0-3]?\d[/.\-][0-3]?\d[/.\-]\d{2,4}` + // dd/mm/yyyy or mm/dd/yy
  String.raw`|\d{4}[/.][01]?\d[/.][0-3]?\d` + // yyyy/mm/dd
  // Spelled-out forms — the whole missing half. Ordered longest-first so a
  // day+month+year is never truncated to its month+year tail.
  String.raw`|[0-3]?\d(?:er|ère|ere|e|st|nd|rd|th)?\s+${MONTH}\.?\s+\d{4}` + // 14 mars 1988 · 1er avril 1980
  String.raw`|${MONTH}\.?\s+\d{4})`; // mars 2015

const DOB_RULE: RedactionRule = {
  type: "dob",
  pattern: new RegExp(`(?<=${BIRTH}\\W{0,15})${DATE_CORE}`, "gi"),
};

/**
 * A BARE YEAR of birth ("Né en 1988"), as its OWN rule with a deliberately NARROW
 * lookbehind.
 *
 * ⚠️ Measured, and the reason this isn't just another `DATE_CORE` alternative: as an
 * alternative, `(?:19|20)\d{2}` makes the rule STARTABLE at every year-shaped token in the
 * document, so the wide `BIRTH` lookbehind gets evaluated there too — 0.6 ms → 5.0 ms per
 * pass on a 10 KB document, for ONE extra form. Split out with only the three phrasings
 * that actually precede a bare year, it costs 0.17 ms. `redact` runs on every send and
 * every document; this layer is a hot path (see the package doc's own warning).
 */
const DOB_YEAR_RULE: RedactionRule = {
  type: "dob",
  pattern: new RegExp(
    String.raw`(?<=\bn[ée]{1,2}(?:\(e\))?\s+(?:en|vers)\s+|\bborn\s+in\s+|\bgeboren\s+)(?:19|20)\d{2}`,
    "gi",
  ),
};

/**
 * International sensitive-data rules ported from presidio-ts, spread into the
 * engine's `RULES` after the built-in national-id block and before the phone
 * rule. Country identity/tax/health/licence/vehicle/bank schemes → category
 * "national_id"; context-gated birth dates → category "dob". Checksum-validated
 * or distinctive-shape schemes fire on shape; bare numeric schemes are
 * context-gated so ordinary long numbers pass through in clear.
 */
// MRZ — la bande machine d'une pièce d'identité (ISO 9303, police OCR-B) : NOM, prénoms,
// date encodée et numéro, SOUDÉS aux chevrons (« IDFRADUPONT<<<<<<353113 »). Aucune autre
// règle ne peut voir un nom pris là-dedans, et la relecture ciblée (`ocr/garbled.ts`) rend
// la bande LISIBLE à l'extraction — lue sans cette règle, elle partirait entière en clair.
// Forme seule, et c'est la barre de précision qui l'autorise : ≥25 signes de [A-Z0-9<]
// d'un tenant dont ≥4 chevrons et ≥6 alphanumériques — le code (`<<`, heredocs) n'aligne
// jamais ça d'un seul tenant, et la prose encore moins.
const MRZ_RULE: RedactionRule = {
  type: "national_id",
  pattern: /(?<![A-Z0-9<])[A-Z0-9<]{25,}(?![A-Z0-9<])/g,
  validate: isMrzShaped,
};

export const INTERNATIONAL_RULES: RedactionRule[] = [
  DOB_RULE,
  DOB_YEAR_RULE,
  MRZ_RULE,
  ...US_RULES,
  ...EUROPE_RULES,
  ...APAC_RULES,
  ...LATAM_RULES,
];
