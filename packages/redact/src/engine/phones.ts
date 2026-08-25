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
import { findPhoneNumbersInText, isValidPhoneNumber } from "libphonenumber-js";

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
  if (!text || text.indexOf("+") === -1) return []; // fast path: intl numbers carry '+'
  let found;
  try {
    found = findPhoneNumbersInText(text);
  } catch {
    return [];
  }
  const out: PhoneMatch[] = [];
  const seen = new Set<string>();
  for (const f of found) {
    const value = text.slice(f.startsAt, f.endsAt).trim();
    if (value.length < 6 || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, start: f.startsAt, end: f.endsAt });
  }
  return out;
}
