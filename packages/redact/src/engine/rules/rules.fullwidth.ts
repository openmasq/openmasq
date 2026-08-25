import type { RedactionRule } from "../../types";
import { foldWidth, ibanValid, luhn } from "../validators";

// FULLWIDTH writings (U+FF10-FF19 digits, U+FF21… letters, ideographic space) —
// how a Japanese/Chinese document types a Western id: «カード番号：４５３９…».
// Every ASCII-classed rule is blind to these glyphs, so the ids shipped in CLEAR.
// The rules here match the RAW fullwidth span (substitution is by verbatim value,
// so the span must be the original glyphs) and VALIDATE on the ASCII fold — the
// same checksums as their ASCII twins, which is what keeps the precision bar:
// a fullwidth quantity that fails Luhn/mod-97/NIR structure is never touched.
// Spread into RULES before `card` (the ASCII twin's position). Fakes: `fakeDigits`
// swaps fullwidth digits within their own width class, so the fake stays CJK-styled.

const FD = "[０-９]"; // fullwidth digit
const FS = "[\\s　]"; // ASCII or ideographic space
const FA = "[Ａ-Ｚａ-ｚ]"; // fullwidth letter

export const FULLWIDTH_RULES: RedactionRule[] = [
  {
    // NIR before card, like the ASCII ordering (a NIR is not a PAN).
    type: "national_id",
    pattern: new RegExp(`${FD}(?:${FS}?${FD}){12,14}`, "g"),
    validate: (m) => /^[12]\d{2}(?:0[1-9]|1[0-2])\d{8}(?:\d{2})?$/.test(foldWidth(m).replace(/\D/g, "")),
  },
  {
    type: "card",
    pattern: new RegExp(`${FD}(?:${FS}?${FD}){11,18}`, "g"),
    validate: (m) => luhn(foldWidth(m)),
  },
  {
    type: "iban",
    pattern: new RegExp(`${FA}{2}${FD}{2}(?:${FS}?(?:${FD}|${FA})){10,30}`, "g"),
    validate: (m) => ibanValid(foldWidth(m)),
  },
];
