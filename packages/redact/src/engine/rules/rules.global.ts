import type { RedactionRule } from "../../types";
import { leiValid, mrzLineValid } from "../validators/validators.world";

// Country-independent identity artifacts. Spread EARLY in `RULES` (before card/IBAN)
// so a whole MRZ line is claimed as ONE span before a numeric rule can nibble a digit
// run out of it. → "national_id". (A VIN rule already lives in rules.identifiers.ts.)
export const GLOBAL_RULES: RedactionRule[] = [
  {
    // ICAO 9303 machine-readable zone — what the OCR of a passport / CNI / titre de
    // séjour produces: 30/36/44-char runs of [A-Z0-9<]. The validator accepts a NAME
    // line (`P<FRAMARTIN<<JULIEN…` — `<<` appears nowhere else in prose at this
    // charset/length) or a DATA line whose embedded check digits verify (OCR-tolerant:
    // one verified check digit suffices). Boundaries are lookarounds, not \b — a line
    // routinely ENDS in `<`, which \b cannot bound.
    type: "national_id",
    pattern: /(?<![A-Z0-9<])[A-Z0-9<]{30,44}(?![A-Z0-9<])/g,
    validate: mrzLineValid,
  },
  {
    // LEI (ISO 17442) — 20 chars, ISO 7064 mod 97-10 like the IBAN's → fires bare.
    // Identifies a legal entity, and often travels beside real financial data.
    type: "company_id",
    pattern: /\b[A-Z0-9]{18}\d{2}\b/g,
    validate: leiValid,
  },
];
