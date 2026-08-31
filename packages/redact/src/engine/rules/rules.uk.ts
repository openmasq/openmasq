import type { RedactionRule } from "../../types";
import { SP } from "./rules.international.util";

/**
 * United Kingdom — the DISTINCTIVE-shape schemes, which fire without a keyword.
 *
 * They used to live directly in `rules.ts`, the only country without its own home while
 * France and Europe have theirs (rule 2: one concept, ONE home). The British schemes GATED
 * by a keyword (passport, UTR) stay with the other gated ones, in
 * `rules.international.europe.ts` — it's the nature of the gate that files it, not the flag.
 *
 * ⚠️ ORDER matters in `RULES`: this block unfolds exactly where the NINO was, between
 * the French rules and the American EIN.
 */
export const UK_RULES: RedactionRule[] = [
  // National Insurance number — 2 letters + 6 digits + 1 letter.
  //
  // ⚠️ It is written IN PAIRS (« AB 12 34 56 C ») everywhere it is PRINTED: that's the form
  // used by gov.uk, an employment contract, a payslip, a P45 and a P60. The rule only
  // knew the GLUED form, so a British employee's national identifier
  // was going out IN CLEAR on their own official paperwork — measured 17/08/2026 on an
  // English employment contract. Same move as the other spaced schemes: `SP` (space,
  // non-breaking space, narrow non-breaking space), and nothing else.
  //
  // ⚠️ No `WRAP` here, unlike the checksum schemes: this number has no
  // checksum, so recovering a VALID PREFIX (`longestValidPrefix`) has no way to reject
  // a truncated prefix. Measured: with `WRAP` + `maxOneWrap`, a column « AB 12 / 34 / 56 C »
  // had its header trimmed to « AB 12\n34 », then redacted — a false positive created while
  // fixing a leak. The wrapped form therefore stays UNHANDLED, and that's stated here.
  //
  // Precision doesn't move: the two leading letters keep their restricted class
  // (no D/F/I/O/Q/U/V) and the trailing letter stays A-D — which an ordinary run
  // of words doesn't reach. `rules.uk.test.ts`.
  {
    type: "national_id",
    pattern: new RegExp(String.raw`\b[A-CEGHJ-PR-TW-Z]{2}(?:${SP}?\d{2}){3}${SP}?[A-D]\b`, "g"),
  },
];
