// International phone detection via libphonenumber-js — a deterministic,
// LANGUAGE-AGNOSTIC detector that complements the loose national-format regex
// rule in `rules.ts`. It recognises + validates phone numbers in INTERNATIONAL
// format (`+33…`, `+1…`, `+44…`) for every country, and — crucially — rejects
// random digit runs (a SIRET, an amount, a reference), so it adds recall on
// foreign numbers without the false positives a broad regex would bring.
//
// National-format numbers with NO country prefix (`0612345678`) are inherently
// ambiguous without a country, so those stay with the regex rule + the labelled-
// field detector (`Tél : …`). Here we only take what libphonenumber can VALIDATE.
import { findPhoneNumbersInText, isValidPhoneNumber, type CountryCode } from "libphonenumber-js";

/**
 * Validate an INTERNATIONAL-format phone match from the regex rule in `rules.ts`
 * (`+…` or `00…`). Normalises `00`→`+`, strips separators, and asks libphonenumber
 * whether it's a real, dialable number — so a random 00-prefixed digit run (a
 * reference like `008-2014`, a code `001800`, a too-short `00260520`) is REJECTED,
 * while true `+33…`/`0033…` numbers pass. Mirrors the module's stated rule: only
 * take what libphonenumber can validate. Never throws.
 */
export function isValidIntlPhone(match: string): boolean {
  const compact = match.trim().replace(/[\s.\-]/g, "");
  const e164 = compact.startsWith("+") ? compact : compact.replace(/^00/, "+");
  if (!e164.startsWith("+")) return false;
  try {
    return isValidPhoneNumber(e164);
  } catch {
    return false;
  }
}

/** One detected phone: the exact substring as it appears + its offsets. */
export interface PhoneMatch {
  value: string;
  start: number;
  end: number;
}

/**
 * Find validated international phone numbers in `text`. Returns the ORIGINAL
 * substring for each (so replacement stays verbatim), de-duplicated by value.
 * Never throws — a parser hiccup yields `[]`.
 */
export function detectPhones(text: string): PhoneMatch[] {
  if (!text) return [];
  const out: PhoneMatch[] = [];
  const seen = new Set<string>();
  if (text.indexOf("+") !== -1) { // intl numbers carry '+'
    let found: ReturnType<typeof findPhoneNumbersInText> = [];
    try {
      found = findPhoneNumbersInText(text);
    } catch {
      found = [];
    }
    for (const f of found) {
      const value = text.slice(f.startsAt, f.endsAt).trim();
      if (value.length < 6 || seen.has(value)) continue;
      seen.add(value);
      out.push({ value, start: f.startsAt, end: f.endsAt });
    }
  }
  for (const m of text.matchAll(NANP_RE)) {
    const value = m[0];
    if (seen.has(value) || !phoneWordInSentence(text, m.index) || !validNational(value, ["US"])) continue;
    seen.add(value);
    out.push({ value, start: m.index, end: m.index + value.length });
  }
  for (const m of text.matchAll(NATIONAL_RE)) {
    const value = m[0];
    if (seen.has(value) || !phoneWordInSentence(text, m.index) || !validNational(value, NATIONAL_COUNTRIES)) continue;
    seen.add(value);
    out.push({ value, start: m.index, end: m.index + value.length });
  }
  return out;
}

// The OTHER national forms — a trunk « 0 » or a parenthesised area code, then groups:
// « (02) 8765 3421 », « 054 987 56 34 », « 0301 564 9382 », « 0653-03345292 ». No shape is
// distinctive here, so the gate is the same as the NANP one — a phone word in the sentence
// — plus libphonenumber's validation for at least one of the countries that write their
// numbers this way. The French `0X XX XX XX XX` rule already fires without a word; this pass
// only adds what a sentence names as a phone number. (Nemotron-PII, 2026-09-07: the numbers
// left after the NANP form were these.)
const NATIONAL_RE = /(?<![\d\p{L}+.-])(?:\(0?\d{1,4}\)[\s.-]?|0\d{1,4}[\s.-])\d{2,4}(?:[\s.-]?\d{2,4}){1,3}(?![\d\p{L}]|[\s.-]?\d)/gu;
const NATIONAL_COUNTRIES: CountryCode[] = ["GB", "DE", "FR", "IT", "ES", "NL", "BE", "CH", "AT", "AU", "NZ", "IN", "PK", "ZA", "IE", "PT", "SE", "NO", "DK", "PL", "BR", "MX", "JP"];

function validNational(value: string, countries: CountryCode[]): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 12) return false;
  try {
    return countries.some((c) => isValidPhoneNumber(digits, c));
  } catch {
    return false;
  }
}

// The NORTH AMERICAN national form, no country prefix — « contact us at 775-691-9712 »,
// « call (740) 726-0548 » — written with its dashes, dots or parentheses at the 3-3-4
// joints. The shape alone is not the rule (a `\d{3}-\d{3}-\d{4}` is also a part number): the
// three anchors together are — the punctuated 3-3-4 shape, libphonenumber's US validation
// (area code and exchange in [2-9], no N11 exchange), and a PHONE word within the sentence
// (`NANP_CONTEXT`, 80 characters before the number, a « Tel : » label included — a labelled
// number is the labelled-field detector's, so this pass only adds the prose form).
// Measured 2026-09-07 on Nemotron-PII (`bench/spans/`): 55 % of its phone numbers written
// this way, none found without a label.
// The area code and the exchange start in [2-9], and no exchange is an N11 service code
// (« 502-411-7227 » dials directory assistance) — the plan's own rules, stated here because
// libphonenumber's compact metadata does not carry every one of them.
const NANP_RE = /(?<![\d\p{L}+.-])(?:\((?:[2-9]\d{2})\)\s?(?![2-9]11)[2-9]\d{2}[-.]\d{4}|[2-9]\d{2}[-.](?![2-9]11)[2-9]\d{2}[-.]\d{4})(?![\d\p{L}]|[-.]\d)/gu;
const NANP_CONTEXT = /\b(?:phone|tel|telephone|call|calling|dial|reach|reached|contact|fax|mobile|cell|cellphone|hotline|line|text|sms|voicemail|téléphone|appeler|joindre|joignable)\b|☎|📞/iu;

function phoneWordInSentence(text: string, at: number): boolean {
  const before = text.slice(Math.max(0, at - 80), at);
  // The context is read BACK to the start of the sentence only — a « phone » two lines up
  // does not vouch for an order number.
  // A sentence ends at a stop FOLLOWED BY A SPACE — the dot inside « kristindiaz54@gmail.com
  // and 212-515-8332 » ends nothing.
  let cut = 0;
  for (const m of before.matchAll(/[.!?;](?=\s)/gu)) cut = m.index + 1;
  const sentence = before.slice(Math.max(before.lastIndexOf("\n"), cut, 0));
  return NANP_CONTEXT.test(sentence);
}
