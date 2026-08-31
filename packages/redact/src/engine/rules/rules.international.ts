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
// « Néle)le : », « Né(e)le: » (scanned French ID card, 14/08: the REAL date of birth was
// leaving in clear, the letter debris blocking both the connector and the `\W` gap). Bounded to
// the paren/l/e alphabet so it can never eat into a real word (« Nélson ») beyond what the
// date requirement then refuses.
const BORN = String.raw`\bn[ée]{1,2}(?:\(e\))?(?:[()le]{0,5})?`;
// Extended beyond FR+EN+DE (external bench, 2026-08-31): ES/IT/PT/NL/PL/SV/DA — the
// languages of the internal corpus. Every short trigger carries its own `\b` (« nato » ⊂
// « senato », « född » ⊂ nothing but safety first); the long phrases anchor
// themselves. The date remains MANDATORY behind it: context alone redacts nothing.
const BIRTH_PHRASE =
  String.raw`(?:${BORN}|date\s+de\s+naissance|ddn|dtn|anniversaire` +
  String.raw`|born|d\.?o\.?b\.?|date\s+of\s+birth|birthday|geboren` +
  String.raw`|\bnacid[oa]\b|fecha\s+de\s+nacimiento` + // ES
  String.raw`|\bnat[oa]\b|data\s+di\s+nascita` + // IT
  String.raw`|\bnascid[oa]\b|data\s+de\s+nascimento` + // PT
  String.raw`|geboortedatum` + // NL (« geboren » already covered)
  String.raw`|\burodzon[ya]\b|data\s+urodzenia` + // PL
  String.raw`|\bf[öø]d[dt]\b|f[öø]delsedatum|f[öø]dselsdato)`; // SV / DA
// ⚠️ The connector belongs HERE, not to the `\W{0,15}` gap below: that gap only spans
// NON-word characters, so "né en 1988", "né un 1er avril" and "date de naissance est le
// 8 janvier 2003" never reached the date (measured — 8 of 18 forms detected). Every part
// is optional, so the bare "Né le …" this replaces still matches.
const CONNECT =
  String.raw`(?:\s+(?:est|était|etait|is|was|ist|war))?(?:\s*:)?` +
  // The CONVERSATIONAL turn of phrase — « date of birth. It's 6/24/1991 » (7 occurrences in the
  // external bench, the exact wording of a chat): the sentence closes then restarts, and the
  // `\W{0,15}` gap doesn't cross the letters of « It's ». The arm is bounded to these
  // precise phrasings, the date remains mandatory behind it.
  String.raw`(?:\s*[.!?]?\s*(?:it['’]?s|it\s+is|c['’]?est|es\s+el|è\s+il))?` +
  // + the articles of the new languages: « nacido EL 14/03 », « nato IL 12/05 »,
  // « urodzony DNIA … » — without them the `\W{0,15}` gap (non-word chars only) never
  // crosses the article and the date stays in clear.
  String.raw`(?:\s+(?:le|la|en|un|vers|au|the|on|in|am|el|il|em|op|den|dnia|w))?`;
const BIRTH = `${BIRTH_PHRASE}${CONNECT}`;
// Month NAMES, longest-first inside each language so "mar" can't shadow "mars".
const MONTH =
  String.raw`(?:janvier|février|fevrier|mars|avril|juillet|juin|mai|août|aout` +
  String.raw`|septembre|octobre|novembre|décembre|decembre` +
  String.raw`|january|february|march|april|june|july|august|september|october|november|december` +
  String.raw`|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec` +
  String.raw`|januar|februar|märz|maerz|dezember|oktober` +
  // ES / IT / PT / NL / PL (date genitive) / SV-DA — same rule: long forms
  // first in each language, cross-language duplicates have no effect (the alternative backtracks).
  String.raw`|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre` +
  String.raw`|gennaio|febbraio|aprile|maggio|giugno|luglio|settembre|ottobre|novembre|dicembre` +
  String.raw`|janeiro|fevereiro|mar[çc]o|maio|junho|julho|setembro|outubro|novembro|dezembro` +
  String.raw`|januari|februari|maart|mei|augustus|augusti|marts|maj` +
  String.raw`|stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrze[śs]nia|pa[źz]dziernika|listopada|grudnia)`;
const DATE_CORE =
  String.raw`(?:\d{4}-[01]\d-[0-3]\d` + // yyyy-mm-dd (ISO)
  String.raw`|[0-3]?\d[/.\-][0-3]?\d[/.\-]\d{2,4}` + // dd/mm/yyyy or mm/dd/yy
  String.raw`|\d{4}[/.][01]?\d[/.][0-3]?\d` + // yyyy/mm/dd
  // Spelled-out forms — the whole missing half. Ordered longest-first so a
  // day+month+year is never truncated to its month+year tail.
  // « de » / « di » optional: « 14 de marzo de 1988 » (ES), « 14 de março de 1988 » (PT).
  String.raw`|[0-3]?\d(?:er|ère|ere|e|st|nd|rd|th)?\s+(?:d[ei]\s+)?${MONTH}\.?\s+(?:de\s+)?\d{4}` + // 14 mars 1988 · 1er avril 1980 · 14 de marzo de 1988
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
// MRZ — the machine-readable zone of an identity document (ISO 9303, OCR-B font): SURNAME,
// given names, encoded date and number, WELDED to chevrons (« IDFRADUPONT<<<<<<353113 »). No
// other rule can see a name caught inside it, and the targeted re-reading (`ocr/garbled.ts`)
// makes the band READABLE at extraction — read without this rule, it would leave whole in
// clear. Shape alone, and it's the precision bar that allows it: ≥25 chars of [A-Z0-9<]
// in one run with ≥4 chevrons and ≥6 alphanumerics — code (`<<`, heredocs) never lines this
// up in one run, and prose even less so.
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
