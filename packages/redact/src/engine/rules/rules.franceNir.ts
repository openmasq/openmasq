import type { RedactionRule } from "../../types";
import { gate, WRAP, SP, maxOneWrap } from "./rules.international.util";

// French NIR (numéro de sécurité sociale): sex(1) + year(2) + month(2) + département(2, or
// 2A/2B, or 3 overseas) + commune + order(3) + key(2). No checksum REQUIREMENT on a standard
// NIR: these numbers arrive through OCR, where one misread digit would fail the key and LEAK
// the whole number — structure + separators carry the precision instead.

/** The SPACED/dotted NIR rule's guard: the optional separators also match a BARE 13-digit
 *  run, which collides with epoch-milliseconds. Accept only the distinctive forms: a
 *  separator present, the full 15 digits, or a Corsican 2A/2B département. */
export function nirSpacedDistinct(match: string): boolean {
  if (/[   .\-\n]/.test(match)) return true;
  if (/2[ABab]/.test(match)) return true;
  return match.replace(/\D/g, "").length === 15;
}

/** The NIR key: 97 − (first 13 digits mod 97), Corsica 2A → 19, 2B → 18. */
export function nirKeyValid(match: string): boolean {
  const s = match.replace(/[^0-9ABab]/g, "").toUpperCase();
  if (s.length !== 15) return false;
  const body = s.slice(0, 5) + s.slice(5, 7).replace("2A", "19").replace("2B", "18") + s.slice(7, 13);
  if (!/^\d{13}$/.test(body) || !/^\d{2}$/.test(s.slice(13))) return false;
  return 97 - (Number(body) % 97) === Number(s.slice(13));
}

/** Month 01–12 passes on structure. The SPECIAL months (20–42, 50–99: birth month unknown,
 *  provisional registration) are real but would widen a bare shape to almost any number,
 *  so they must carry a VALID key. 13–19 and 43–49 are never issued. */
export function nirMonthOk(match: string): boolean {
  const mm = Number(match.replace(/[^0-9ABab]/g, "").slice(3, 5));
  if (mm >= 1 && mm <= 12) return true;
  if (mm < 20 || (mm >= 43 && mm <= 49)) return false;
  return nirKeyValid(match);
}

const MONTH = String.raw`(?:0[1-9]|1[0-2]|[2-9]\d)`;
/** Separator: space/dot/dash, or ONE mid-value line wrap (`WRAP`). */
const S = String.raw`(?:${SP}|[.\-]|${WRAP})?`;
/** A digit, or the OCR's O-for-zero (keyword-gated rule only). */
const D = "[0-9Oo]";

export const NIR_RULES: RedactionRule[] = [
  {
    // The legacy GLUED 15-digit form.
    type: "national_id",
    pattern: new RegExp(String.raw`\b[12]\d{2}${MONTH}\d{10}\b`, "g"),
    validate: nirMonthOk,
  },
  {
    // Fully LETTER-SPACED by OCR ("1 8 4 0 3 7 5 1 2 0 0 0 5 1 2").
    type: "national_id",
    pattern: new RegExp(String.raw`\b[12](?:${SP}\d){14}\b`, "g"),
    validate: (m) => /^[12]\d{2}\d{12}$/.test(m.replace(/\D/g, "")) && nirMonthOk(m),
  },
  {
    // As actually WRITTEN: grouped by spaces, dots or dashes, Corsican 2A/2B, and the
    // 13-digit form without its key. `nirSpacedDistinct` rejects the bare-13 epoch-ms run.
    type: "national_id",
    pattern: new RegExp(
      String.raw`\b[12]${S}\d{2}${S}${MONTH}${S}(?:\d{2}|2[ABab])${S}\d{3}${S}\d{3}(?:${S}\d{2})?\b`,
      "g",
    ),
    validate: (m) => maxOneWrap(m) && nirSpacedDistinct(m) && nirMonthOk(m),
  },
  {
    // BEHIND a keyword (« N° SS : … », « sécu », « NIR »): the keyword carries the precision,
    // so the shape is relaxed — the bare 13 digits (the epoch-ms ambiguity the rules above
    // refuse), any month, a provisional 3/7/8 sex digit, and the OCR O-for-zero. Only the
    // COUNT is checked: 13 or 15 characters, the NIR without or with its key.
    type: "national_id",
    pattern: gate(
      String.raw`nir|ss|s[ée]cu(?:rit[ée] sociale)?|insee`,
      String.raw`[123478]${S}${D}{2}${S}${D}{2}${S}(?:${D}{2,3}|2[ABab])${S}${D}{2,3}${S}${D}{3}(?:${S}${D}{2})?\b`,
    ),
    validate: (m) => maxOneWrap(m) && [13, 15].includes(m.replace(/[^0-9OoABab]/g, "").length),
  },
];
