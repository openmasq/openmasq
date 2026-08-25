import type { Detection } from "../types";

// The labeled-NUMBER detectors: an identifier that has no shape of its own and is proven
// only by the LABEL introducing it (account, fiscal, contract). Split out of
// `contextFields.ts` (LOC cap) — the `label : value` passes stay there; these are anchored
// on the DIGIT RUN instead, which is what lets "Compte n° 12345678" match without a colon.

// A bare account number is just digits (no distinctive shape), so it's left alone
// by the rules — else every quantity/timestamp would be redacted. But a number
// introduced by an ACCOUNT label ("Compte", "N° de compte", "Compte courant/
// bancaire", "account (number)") IS an account number. Unlike the colon-only
// labeled-field detector above, this is ANCHORED ON THE DIGITS — the label may be
// followed by `n°`/`#`/`:`/space then the run — so "Compte n° 12345678" and
// "Compte : 12345678" both match, while prose ("je me rends compte que…") never
// does (no digit run follows). Value = the digit run (spaces/dashes kept verbatim).
const ACCOUNT_RE =
  /(?<![\p{L}])(?:comptes?(?:\s+(?:bancaire|courant))?|(?:num[eé]ro|n[°ºo]|no)\.?\s*(?:de\s+)?comptes?|(?:bank\s+)?account(?:\s+(?:number|no))?)\b[\s:：#.\-]*(?:n[°ºo]\.?\s*)?[:：]?\s*([0-9][0-9 .\-]{5,}[0-9])/giu;

// French tax id ("numéro fiscal" / SPI, 13 digits) + English TIN. Same idea as
// ACCOUNT_RE: a bare number is left alone, but a FISCAL label + a digit run is an
// identifier. Covers the label VARIANTS the colon-only detector missed ("N° fiscal",
// "Identifiant fiscal", "Numéro fiscal de référence", "Référence fiscale", "Numéro
// SPI", "tax id"). A `fiscal[e]` must be preceded by an id starter (numéro/n°/no/
// identifiant/référence), so "année/politique fiscale" never matches.
const FISCAL_RE =
  /(?<![\p{L}])(?:(?:num[eé]ro|n[°ºo]|no|identifiant|r[eé]f[eé]rence)\.?\s*(?:d['’]identification\s+)?fiscal[e]?(?:\s+de\s+r[eé]f[eé]rence)?|num[eé]ro\s+spi|tax\s+id(?:entification)?(?:\s+number)?|fiscal\s+(?:number|id))\b[\s:：#.\-]*(?:n[°ºo]\.?\s*)?[:：]?\s*([0-9][0-9 .\-]{7,}[0-9])/giu;

// CUSTOMER-RELATIONSHIP identifiers. A « N° client », « numéro de dossier », « n° de
// contrat/police/commande/facture », a PDL/PRM (electricity delivery point) or the legal
// (An identifier may open with a SHORT letter prefix — « facture n° F2025-0412 »,
// « référence DEM-2026-00841 » — which a digits-only value pattern shipped in clear.)
// « immatriculé sous le n° … » idiom all identify a PERSON's relationship with one
// provider — measured on real scanned documents (EDF attestation, insurance bulletin,
// invoices), they were the single largest recall gap: 10/137 truth values, all left in
// clear because no rule knew these labels. Same discipline as ACCOUNT_RE: the label may
// be garbled-adjacent ("Numéro de police et date de validité :"), so up to four short
// filler words may sit between the label noun and the digit run — the strong label HEAD
// plus a ≥6-digit run is what keeps prose out. The run accepts `/` ("86517808/808109154",
// a real insurance-policy format); a pure DATE shape is rejected in detectLabeledNumber.
const CONTRACT_RE =
  /(?<![\p{L}])(?:(?:num[eé]ro|n[°ºo]|no|r[eé]f[eé]rence|ref)\.?\s*(?:de\s+|d['’])?(?:la\s+)?(?:client|dossier|contrat|police|adh[eé]sion|adh[eé]rent|commande|facture|abonn[eé]|assur[eé]|soci[eé]taire|certification)e?s?|(?:client|dossier|contrat|police|adh[eé]rent|commande|facture)\s+(?:num[eé]ro|n[°ºo]|no)\.?|point\s+de\s+livraison(?:\s*\(\s*pdl\s*\))?|sous\s+le\s+(?:num[eé]ro|n[°ºo]))(?:\s*\([^)\n]{0,20}\))?(?:\s+[\p{L}'’]{1,12}){0,4}?[\s:：#.\-]*(?:n[°ºo]\.?\s*)?[:：]?\s*((?:[A-Z]{1,4}[-\/]?)?[0-9][0-9 .\-\/]{4,}[0-9])/giu;

/** Detect a labeled identifier NUMBER anchored on its digit run (colon optional).
 *  `minDigits` guards against short numbers (a year, a count); a decimal-amount
 *  tail is rejected. Category "ID" → `national_id` (same-length digit fake). */
function detectLabeledNumber(text: string, re: RegExp, minDigits: number): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    // Cut at a column gap (2+ spaces) FIRST: the digit run tolerates single spaces,
    // so on a two-column PDF line it crosses the gap and glues the right column's
    // leading digit in ("317645928␣…␣5 rue des Bruyères" → value "…␣5") — a value
    // that no longer occurs verbatim, so the REAL number ships in clear.
    const value = (m[1] ?? "").split(/\s{2,}/)[0]!.replace(/[\s.\-]+$/u, "").trim();
    if (value.replace(/\D/g, "").length < minDigits) continue;
    if (/[.,]\d{1,2}$/.test(value)) continue; // a money amount, not an identifier
    // A pure DATE is never an identifier — "n° de contrat du 12/05/2024" names the
    // contract's date, and faking a date as an id corrupts every duration the model
    // reasons about. (Digit-count gates can't catch this: a date carries 6-8 digits.)
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, category: "ID" });
  }
  return out;
}

/** Account numbers introduced by an account label (see {@link ACCOUNT_RE}). */
export function detectAccountNumbers(text: string): Detection[] {
  return detectLabeledNumber(text, ACCOUNT_RE, 7);
}

/** Tax numbers introduced by a fiscal label (see {@link FISCAL_RE}). */
export function detectFiscalNumbers(text: string): Detection[] {
  return detectLabeledNumber(text, FISCAL_RE, 9);
}

/** Customer/contract identifiers introduced by a relationship label (see {@link CONTRACT_RE}). */
export function detectContractNumbers(text: string): Detection[] {
  return detectLabeledNumber(text, CONTRACT_RE, 6);
}

