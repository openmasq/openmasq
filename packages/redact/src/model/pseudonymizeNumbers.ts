// Bare-number handling for `pseudonymize` (split out to keep the main file small).
// A standalone number that matches no identifying entity ("meaningless" figure —
// a quantity, a count) is LEFT UNTOUCHED by default; only when `numbers: true` is
// explicitly passed are such numbers replaced with `n1`/`n2`/… tokens. Identifying
// numbers (phone/card/IBAN/postal/DOB/national_id/ip) always carry meaning and are
// swapped same-kind regardless.
import { redactionCategory } from "../kinds";

// A standalone number, keeping grouped thousands together: "850 000",
// "1 234,56", "1,000,000", "320000" each match as ONE number (incl. the
// non-breaking / narrow spaces French copy-paste often uses), so a single value
// never splits into several tokens.
export const NUMBER_RE = new RegExp(
  // group 1: thousands-grouped number ("850 000", "1 234,56", "1,000,000");
  // group 2: a plain integer/decimal. Separators include normal, non-breaking
  // ( ) and narrow ( ) spaces that French copy-paste produces.
  "\\d{1,3}(?:[ \\u00a0\\u202f.,]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?",
  "g",
);

/** A value that is essentially just a number (digits + grouping/decimal/sep). */
export function isBareNumber(value: string): boolean {
  return /^\d(?:[\d\s.,\-/]*\d)?$/.test(value.trim());
}

/**
 * A bare 4-digit CALENDAR YEAR (1900–2099). Excluded from `numbers` tokenisation: a
 * year label ("ETF 2026", "bilan 2025") is not a private figure to compute on, and
 * tokenising it corrupts dates/labels AND pollutes the vault (the reported "2026 → n1"
 * that broke financial output + popped the web-nav reveal card). NOT a leak to spare:
 * an identifying number keeps its own category and is swapped by `numberCarriesMeaning`
 * regardless — this only concerns the vague NUMBER/quantity bucket.
 */
export function isBareYear(value: string): boolean {
  return /^(?:19|20)\d{2}$/.test(value.trim());
}

/**
 * Whether a bare number genuinely carries identifying meaning for its category —
 * a phone, card, IBAN, national id, date of birth, postal/zip code, account, or a
 * numeric secret/PIN/CVV. Such numbers ARE swapped (same-kind). A bare number with
 * a vague category (OTHER / NUMBER / quantity) "corresponds to nothing" and is
 * left untouched unless `numbers` tokenisation is explicitly on.
 */
export function numberCarriesMeaning(category: string): boolean {
  const cat = redactionCategory(category);
  // An IP (and MAC → category "ip") looks like a dotted "bare number" but was
  // matched by the specific IP *rule*, so it genuinely identifies — swap it for a
  // same-shape fake IP, never leave it in clear. (Without this, `pseudonymize`
  // dropped every IP the marker-mode `redact()` catches → IPs leaked to the model.)
  // `health` covers a NUMERIC medical-record number (MRN) — an Art. 9 identifier;
  // without it the bare-number gate dropped "MRN 88213470" in pseudonymize while
  // marker-mode redact() (no gate) caught it. Parity pinned in aiKinds.test.ts.
  if (cat === "phone" || cat === "card" || cat === "iban" || cat === "national_id" || cat === "dob" || cat === "ip" || cat === "salary" || cat === "company_id" || cat === "health")
    return true;
  return /postal|postcode|\bzip\b|\bdate\b|account|siren|siret|\bvat\b|passport|secret|key|token|password|credential|\bpin\b|cvv|cvc/i.test(
    category,
  );
}
