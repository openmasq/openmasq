import type { RedactionRule } from "../../types";
import { deconfuseOcrDigits, isEpochMs, isIdBesideNumber, luhn, luhnDigits } from "../validators";
import { SP, WRAP, gate, maxOneWrap } from "./rules.international.util";

/** Payment-card PANs. Ordered BEFORE the phone rules (`rules.ts`) so a 16-digit PAN is never
 *  split; separators tolerate ONE mid-value line wrap (`WRAP` + `maxOneWrap`). */
export const CARD_RULES: RedactionRule[] = [
  {
    // 13–19 digits confirmed by Luhn. Separators are what documents emit: 1-2 spaces (a
    // PDF column gap), the typographic dashes Word substitutes, a hyphenated line break.
    type: "card",
    // ⚠️ `(?:${WRAP})?`, never `${WRAP}?` — WRAP ends in `*`, so a bare `?` turns it LAZY
    // and the dash then REQUIRES a newline.
    // The digit class admits the OCR confusables O/o INSIDE only (a scan renders a PAN as
    // « 5453 O112 … »); the second Luhn reading over `deconfuseOcrDigits` plus ≥10 real
    // digits make that safe. First and last chars are real digits, or the pattern becomes
    // startable on the trailing o of a word and its failed match CONSUMES the real card.
    // The two lookarounds keep the rule OUT of a longer hexadecimal identifier: a dash-group
    // carrying a hex LETTER is a UUID continuing, a dashed PAN is digits all the way.
    pattern: new RegExp(
      String.raw`(?<![0-9a-f]-)\b\d(?:(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?[0-9Oo]){11,17}(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?\d\b(?!-[0-9a-f]*[a-f])`,
      "g",
    ),
    // `!isEpochMs` before Luhn: a 13-digit epoch-ms timestamp passes Luhn one time in ten.
    validate: (m) =>
      maxOneWrap(m) &&
      !isEpochMs(m) &&
      !isIdBesideNumber(m) &&
      (luhn(m) || ((m.match(/\d/g)?.length ?? 0) >= 10 && luhn(deconfuseOcrDigits(m)))),
  },
  {
    // SHORT Maestro: 12 digits, the only length under 13 a network issues. Any 12-digit
    // run passes Luhn one time in ten, so TWO anchors: the Maestro IIN prefix AND Luhn.
    // After the 13-19 rule so a longer run keeps priority.
    type: "card",
    pattern: new RegExp(
      String.raw`\b(?:5018|5020|5038|5893|6304|6759|676[123])(?:(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?\d){8}\b`,
      "g",
    ),
    // `luhn()` carries the 13-19 floor; the regex fixes the length, only the checksum is needed.
    validate: (m) => {
      const d = m.replace(/\D/g, "");
      return maxOneWrap(m) && d.length === 12 && luhnDigits(d);
    },
  },
  {
    // 12 digits WITHOUT a Maestro IIN: only under an explicit card label — the context
    // replaces the prefix as the second anchor, Luhn stays the first (same logic as SSN).
    // gate()'s HEAD blocks « postcard ».
    type: "card",
    pattern: gate(
      String.raw`(?:credit|debit)\s+card|card|carte(?:\s+(?:bancaire|bleue|de\s+cr[ée]dit))?|kreditkarte|tarjeta|carta`,
      String.raw`\d(?:(?:${SP}{1,2})?\d){11}\b`,
    ),
    validate: (m) => {
      const d = m.replace(/\D/g, "");
      return d.length === 12 && luhnDigits(d);
    },
  },
];
