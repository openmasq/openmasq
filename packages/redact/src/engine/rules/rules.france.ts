import type { RedactionRule } from "../../types";
import { frVat, sirenSiret } from "../validators";
import { gate, WRAP, SP, maxOneWrap } from "./rules.international.util";

// French identity / tax / residency schemes, grouped as ONE family (root rule 10) —
// the app is FR-first, so this is the coverage that actually meets its users' identity
// documents (CNI, passport, NIR, driving licence, residence permit). Spread into `RULES` at the
// SAME position the FR block always occupied: AFTER card/IBAN (so a Luhn-valid PAN is
// never nibbled) and BEFORE the international spread. All → "national_id".
//
// Precision bar (engine/CLAUDE.md): every scheme whose shape is a banal digit/alnum
// run is CONTEXT-GATED; only the structurally distinctive NIR forms fire bare. And no
// checksum REQUIREMENT on the NIR key on purpose: these numbers reach us through OCR
// (the exact scenario this family serves), where one misread digit would fail the key
// and LEAK the whole number — structure + separators carry the precision instead.
const nid = (pattern: RegExp, validate?: (m: string) => boolean): RedactionRule => ({
  type: "national_id",
  pattern,
  validate,
});

/** The SPACED/dotted NIR rule's guard: the pattern tolerates optional separators, so
 *  it also matches a BARE 13-digit run — which collides with epoch-milliseconds
 *  timestamps ("1650318742596" parses as sex 1, year 73, month 02). Accept only the
 *  forms that are structurally distinctive: a separator is present (the canonical
 *  "1 65 03 18 742 596 90" grouping), OR the full 15 digits (key included; a bare
 *  15-digit run is already the legacy rule's territory), OR a Corsican 2A/2B
 *  département (letters make it unambiguous). */
export function nirSpacedDistinct(match: string): boolean {
  if (/[ \u00A0\u202F.\n]/.test(match)) return true;
  if (/2[ABab]/.test(match)) return true;
  return match.replace(/\D/g, "").length === 15;
}

/** The spaced schemes' separator: space/dot, or ONE mid-value line wrap (`WRAP`). */
const S = String.raw`(?:${SP}|\.|${WRAP})?`;

export const FRANCE_RULES: RedactionRule[] = [
  {
    // French INSEE / NIR — 15 digits (sex + year + valid month), the legacy GLUED form.
    type: "national_id",
    pattern: /\b[12]\d{2}(?:0[1-9]|1[0-2])\d{10}\b/g,
  },
  {
    // NIR fully LETTER-SPACED by OCR ("1 8 4 0 3 7 5 1 2 0 0 0 5 1 2") — the
    // grouped rule below only tolerates separators BETWEEN canonical groups, so a
    // per-digit spacing shipped the whole number in clear. Shape: 15 single-spaced
    // digits; the NIR structure (sex + valid month) on the glued digits carries the
    // precision (a random spaced column rarely starts [12] with a 01-12 month).
    type: "national_id",
    pattern: new RegExp(String.raw`\b[12](?:${SP}\d){14}\b`, "g"),
    validate: (m) => /^[12]\d{2}(?:0[1-9]|1[0-2])\d{10}$/.test(m.replace(/\D/g, "")),
  },
  {
    // NIR as actually WRITTEN: separator-grouped ("1 65 03 18 742 596 90", dots
    // tolerated), Corsican 2A/2B département, and the 13-digit form without its key —
    // all missed by the glued rule above. Separators tolerate ONE mid-value line
    // wrap (`WRAP` + `maxOneWrap` — a hard-wrapped "1 84 03 75\n120 005 12" used to
    // pass in CLEAR). `nirSpacedDistinct` rejects the bare-13 epoch-ms collision.
    type: "national_id",
    pattern: new RegExp(
      String.raw`\b[12]${S}\d{2}${S}(?:0[1-9]|1[0-2])${S}(?:\d{2}|2[ABab])${S}\d{3}${S}\d{3}(?:${S}\d{2})?\b`,
      "g",
    ),
    validate: (m) => maxOneWrap(m) && nirSpacedDistinct(m),
  },
  // French intra-community VAT — "FR <key> <SIREN>" ("FR 79 345 360 051"), internal
  // spaces tolerated. Fires on SHAPE with NO keyword because `frVat` double-checksums
  // the 2-digit key + embedded SIREN. BEFORE the SIREN/RCS rule so the WHOLE number
  // (incl. the "FR" prefix) is ONE span — otherwise only its SIREN was grabbed (as an
  // RCS id in a company doc) and the "FR <key>" prefix leaked.
  {
    type: "company_id",
    pattern: new RegExp(String.raw`\bFR(?:${SP}?\d){11}\b`, "gi"),
    validate: frVat,
  },
  // FR VAT BEHIND its keyword — NO Luhn (the SIREN rule's OCR discipline: keyword +
  // FR+11 structure carry the precision; shape-only keeps frVat above). Complements the
  // `gi` EU rule (rules.identifiers.ts): its match can start INSIDE a lowercase word
  // and the consumed span shadows the real number in its own pass — this independent
  // scan is the recovery. Residual: the fake VAT is independent of the neighbouring fake SIREN.
  {
    type: "company_id",
    pattern: gate("tva|vat|intracom(?:munautaire)?", String.raw`FR(?:${SP}?\d){11}\b`),
    validate: maxOneWrap,
  },
  // French SIREN(9)/SIRET(14) — context-gated (a bare 9/14-digit run is far too
  // common). NO Luhn requirement, same discipline as the NIR above: these numbers
  // reach us through OCR'd company documents, where one misread digit fails the
  // checksum and LEAKS the whole number — the scheme keyword + the exact 9/14
  // structure carry the precision instead. Two gates, because French legal
  // boilerplate writes the keyword on EITHER side: "SIRET 775 384 225 00013"
  // (keyword first) and "850 861 036 RCS Mulhouse" (number first).
  {
    type: "company_id",
    // gate() (not a raw lookbehind) so the conversational turn reaches it too:
    // « le numéro SIREN de la société est 863 471 587 » — the linking-words
    // tolerance lives in ONE place.
    pattern: gate(
      "siren|siret|rcs",
      String.raw`\d(?:(?:${SP}|${WRAP})?\d){8}(?:(?:(?:${SP}|${WRAP})?\d){5})?\b`,
    ),
    validate: maxOneWrap,
  },
  {
    type: "company_id",
    pattern: new RegExp(
      String.raw`\b\d(?:(?:${SP}|${WRAP})?\d){8}(?:(?:(?:${SP}|${WRAP})?\d){5})?(?=[\s,]{1,3}R\.?C\.?S\b)`,
      "g",
    ),
    validate: maxOneWrap,
  },
  // Old-style « RC 424613305 » (registre du commerce, pre-1984 papers still cite it —
  // and syndic/copro headers copy the mention verbatim). « RC » ALONE is far more
  // ambiguous than « RCS » (responsabilité civile writes « attestation RC n° … »), so
  // unlike the rule above this arm demands the SIREN checksum: keyword + Luhn is the
  // pair that carries the precision, exactly the phase-2 discipline.
  // ⚠️ SLIM adjacency lookbehind, NOT gate(): a digit-startable core evaluates its
  // lookbehind at EVERY digit of a statement's number columns, and gate()'s
  // linking-words tolerance (backtracking, case-folded) there took redact() from
  // ~2 s to timeout on the relevé fixtures. « RC » is printed ADJACENT — the
  // conversational-turn tolerance is the RCS rule's job, not this arm's.
  {
    type: "company_id",
    pattern: new RegExp(
      String.raw`(?<=\bR\.?C\.?[\s:.n°ºNoO-]{1,6})\d(?:(?:${SP}|${WRAP})?\d){8}(?:(?:(?:${SP}|${WRAP})?\d){5})?\b`,
      "g",
    ),
    validate: (m) => maxOneWrap(m) && sirenSiret(m.replace(/\D/g, "").slice(0, 9)),
  },
  // Real-estate professional card (loi Hoquet) — « CPI 6902 2018 000 024 618 »:
  // registry(4) year(4) number(3 3 3). Strict structure + adjacent keyword; no
  // published checksum for this scheme, the 4-4-3-3-3 form is the second factor. Same
  // SHORT lookbehind as « RC » above, for the same cost reason.
  {
    type: "national_id",
    pattern: new RegExp(
      String.raw`(?<=\bC\.?P\.?I\.?[\s:.n°ºNoO-]{1,6})\d{4}${SP}\d{4}(?:${SP}\d{3}){3}\b`,
      "g",
    ),
  },
  // EUID (BRIS, on every K-bis) — the REAL French wire form is "FR7501.863471587"
  // (FR + 4-digit greffe code + "." + SIREN); "FR.RCS.PA.775 384 225" variants also
  // circulate. The SIREN gate above can't reach either: the register segment sits
  // between the keyword and the digits. Two rules, the WHOLE identifier as one span:
  //  • the French forms fire BARE — the checksum is the LAST-9-digits Luhn (the
  //    embedded SIREN; the full digit string includes the greffe code, so a
  //    whole-string `sirenSiret` would see 13 digits and always fail);
  //  • any country's form fires behind the "euid" label (register codes vary too much
  //    for a safe bare shape — "DEK1101R.HRB147936" is a German one).
  {
    type: "company_id",
    pattern:
      /\bFR(?:\.?\s?RCS(?:\.?[A-Za-z]{1,12})?|\d{4}[A-Za-z]?)\.?\s?\d{3}[ .]?\d{3}[ .]?\d{3}\b/gi,
    validate: (m) => sirenSiret(m.replace(/\D/g, "").slice(-9)),
  },
  {
    type: "company_id",
    pattern: gate("euid", String.raw`[A-Za-z]{2}[A-Za-z0-9.]*\d(?:[ .]?\d{2,}){0,5}\b`),
  },
  // PDL / PRM — the 14-digit electricity/gas delivery-point id (EDF/Enedis bills,
  // Linky). Address-linked (it identifies the HOME), banal shape → gated on the
  // scheme keyword, no checksum (none published).
  {
    // The `\)?` on the acronyms: bills write "point de livraison (PDL) : …" — the
    // closing paren sits between keyword and digits, outside gate()'s separator class.
    type: "national_id",
    pattern: gate(
      String.raw`pdl\)?|prm\)?|point de livraison|point r[eé]f[eé]rence mesure`,
      String.raw`\d{14}\b|\d{2}(?:${SP}\d{3}){4}\b`,
    ),
  },
  // CRPCEN — the notary-office registry number ("identifié sous le numéro CRPCEN
  // 95079"): 5 banal digits, but the scheme keyword IS the precision (same discipline
  // as AGDREF/CAF below). Left in clear it re-identifies the office even when the
  // notary's name and the office's address are redacted.
  { type: "company_id", pattern: gate("crpcen", String.raw`\d{5}\b`) },
  // French passport — 2 digits + 2 letters + 5 digits ("12AB34567"). The shape
  // reads like any product/order code → context-gated on the document word.
  nid(gate("passeport|passport", String.raw`\d{2}[A-Za-z]{2}\d{5}\b`)),
  // French national identity card — old card: 12 digits; 2021 card: 9 alnum document
  // number. Both banal shapes → gated (both apostrophe glyphs tolerated in the label).
  nid(
    gate(
      "carte nationale d['’]identit[eé]|carte d['’]identit[eé]|cni",
      String.raw`\d{12}\b|(?=[A-Za-z0-9]{9}\b)(?=[A-Za-z]*\d)[A-Za-z0-9]{9}\b`,
    ),
  ),
  // Driving licence — 12 alphanumerics (old + new formats), must carry a digit
  // (else an ordinary 12-letter word after "permis" would match). Gated.
  nid(
    gate(
      "permis de conduire|permis|driving licen[cs]e|driver'?s? licen[cs]e",
      String.raw`(?=[A-Za-z0-9]{12}\b)(?=[A-Za-z]*\d)[A-Za-z0-9]{12}\b`,
    ),
  ),
  // Residence permit / foreign-national number (AGDREF) — 9-10 digits, banal shape → gated.
  nid(gate("titre de s[eé]jour|num[eé]ro [eé]tranger|agdref", String.raw`\d{9,10}\b`)),
  // CAF beneficiary id (7 digits) / France Travail–Pôle Emploi id (digits, often + a
  // letter; the post-2024 "numéro France Travail" is 11 digits) — banal shapes, no
  // published checksum → the scheme keyword IS the precision (same as AGDREF above).
  nid(gate(
    String.raw`caf|allocataires?|p[oô]le[ -]?emploi|france[ -]travail|demandeur d'emploi`,
    String.raw`\d{7,11}[A-Za-z]?\b`,
  )),
  // ── PROCEDURE identifiers (jurisdiction / court officers) ─────────────────────
  // A court document's own reference numbers. They carry no personal data by
  // themselves, yet a RG or a Portalis number is a PUBLIC docket key: it
  // RE-IDENTIFIES the parties whose names the engine just redacted. Banal shapes →
  // gated on the scheme keyword, which IS the precision (same discipline as CRPCEN
  // and AGDREF above); no published checksum for any of them.
  // « N° RG 23/04871 » — year/sequence number.
  { type: "national_id", pattern: gate(String.raw`r\.?g\.?`, String.raw`\d{2}[\/-]\d{3,6}\b`) },
  // « N° Portalis DB3R-W-B7H-XKLM » — the national case identifier.
  {
    type: "national_id",
    pattern: gate("portalis", String.raw`[A-Z0-9]{2,5}(?:-[A-Z0-9]{1,5}){2,5}\b`),
  },
  // « avocat au barreau de Paris, toque C1284 » — the bar-registration slot, which
  // identifies the LAWYER (their name is redacted beside it, so leaving the toque
  // undoes that).
  { type: "national_id", pattern: gate("toque", String.raw`[A-Z]{0,2}\s?\d{2,5}\b`) },
  // INE (national pupil/student identifier) — 10 digits + 1 letter (BEA) or
  // 9 digits + 2 letters (RNIE); banal alnum shape → gated on the scheme keyword.
  nid(gate(
    String.raw`ine|identifiant national|num[eé]ro [eé]tudiant|num[eé]ro [eé]l[èe]ve`,
    String.raw`(?:\d{10}[A-Za-z]|\d{9}[A-Za-z]{2})\b`,
  )),
  // RUM — the SEPA mandate's "référence unique du mandat". It keys a standing debit on
  // the debtor's account and travels beside their IBAN on every mandate. Free-form by
  // spec (up to 35 chars), so shape alone proves nothing: gated on the scheme word.
  {
    type: "national_id",
    pattern: gate("rum|référence unique du mandat|reference unique du mandat",
      String.raw`[A-Z0-9][A-Z0-9/\-]{5,34}`),
  },
  // PNR / record locator — the 6-char booking reference. With a passenger name it opens
  // the reservation on most carrier sites, and a 6-char alphanumeric run is far too banal
  // to fire bare. Gated, and it must MIX letters and digits (a plain 6-letter word after
  // "réservation" is prose).
  {
    type: "national_id",
    pattern: gate("pnr|record locator|dossier de réservation|référence de réservation",
      String.raw`[A-Z0-9]{6}`),
    validate: (m: string) => /[A-Z]/.test(m) && /[0-9]/.test(m),
  },
  // Case-file reference in the tri-segment slashed form banks, labs and courts use
  // ("Dossier : 2026/BM/44127"). `CONTRACT_RE` anchors on a DIGIT run and stops at the
  // letter segment, so this shape fell through it. Gated: the bare shape is a date range
  // away from being ordinary.
  {
    type: "national_id",
    pattern: gate("dossier|affaire|référence|reference",
      String.raw`\d{2,4}\/[A-Z0-9]{1,5}\/\d{3,7}`),
    // The middle segment must carry a LETTER: a real case reference is
    // « 2026/BM/44127 », a DATE is « 12/05/2024 » — and now that gate() tolerates
    // linking words, « référence du 12/05/2024 » can reach the shape.
    validate: (m) => /\/[^/]*[A-Za-z][^/]*\//.test(m),
  },
  // The French TAX NOTICE block ("avis d'impôt"), whose identifiers are grouped
  // alphanumeric runs printed under a fixed set of labels: « Numéro FIP », « Référence de
  // l'avis », « Rôle », « Numéro d'occupant ». Only « Numéro fiscal » was covered
  // (`contextFields.ts` FISCAL_RE, digits-only) — the others carry a LETTER group
  // ("20 35 A195936 32") so no digit rule could see them, and they shipped in clear on
  // every avis d'impôt, taxe foncière and taxe d'habitation. Each one keys the taxpayer's
  // file at the DGFiP, so they are `national_id`.
  //
  // Gated on the label, and shape-validated in code because the `i` flag makes `[A-Z]`
  // match lowercase too (`gate` builds with "gi"): a lowercase letter means we captured
  // PROSE after the word — « rôle » in particular is an ordinary noun, and the value gate
  // is what keeps « le rôle de chacun » out.
  {
    type: "national_id",
    pattern: gate(
      // An ALLOW-list of labels, never a wildcard: the value shape alone is far too banal
      // (a grouped alphanumeric run is also a phone, a date range, a product code), so it
      // is the label that decides. Extend it document by document.
      "fip|référence de l'avis|référence de l’avis|reference de l'avis|" +
        "numéro de l'avis|numéro de l’avis|numero de l'avis|" +
        "numéro de rôle|numero de role|rôle|role|" +
        "numéro d'occupant|numero d'occupant|identifiant unique|" +
        "compte cotisant|référence de paiement|reference de paiement|" +
        "numéro de formule|numero de formule",
      // Separator: ONE space, or a punctuation optionally flanked by ONE space each
      // ("21 / 0123456 / 45"). Never a RUN of spaces — 2+ is a COLUMN GUTTER, and
      // crossing it would glue the next column's first token onto the reference.
      String.raw`[0-9A-Z][0-9A-Z]*(?:(?:[ ]?[.\\-\\/][ ]?|[ ])[0-9A-Z]+){1,8}`,
    ),
    validate: taxNoticeRef,
  },
];

/**
 * A tax-notice reference: at least two GROUPS, 8+ alphanumerics, 4+ of them digits, and no
 * lowercase letter. The last condition is the one doing the work — it is what separates an
 * identifier from the prose that follows an ordinary word like « rôle », and it cannot be
 * expressed in the pattern because `gate` compiles case-insensitively.
 */
function taxNoticeRef(m: string): boolean {
  if (/[a-z]/.test(m)) return false;
  const groups = m.split(/[ .\-\/]+/).filter(Boolean);
  if (groups.length < 2) return false;
  const chars = m.replace(/[^0-9A-Z]/g, "");
  return chars.length >= 8 && (m.match(/\d/g) ?? []).length >= 4;
}
