import type { RedactionRule } from "../../types";
import { SP, gate } from "./rules.international.util";
import { imeiValid, iccidValid, vinValid, ribValid } from "../validators/validators.identifiers";

// Extra structured identifiers (all category "national_id", ON by default). Every
// rule is either CHECKSUM-validated, a DISTINCTIVE fixed shape, or CONTEXT-GATED —
// never a bare generic numeric run — so none fires on an order number / SKU / ref.
// Spread into RULES before the `card` rule so a checksummed identifier wins its
// own category rather than being grabbed as a card/phone digit run.
export const IDENTIFIER_RULES: RedactionRule[] = [
  // ── Device ───────────────────────────────────────────────────────────────
  // IMEI — 15 digits, context-gated AND Luhn-checked (a bare 15-digit run is a
  // card/reference otherwise). ICCID — SIM serial, distinctive `89…` + Luhn.
  // IMSI — no checksum exists, so context-gated only.
  { type: "national_id", pattern: gate("imei", String.raw`\d(?:[ -]?\d){14}`), validate: imeiValid },
  { type: "national_id", pattern: /\b89\d{17,18}\b/g, validate: iccidValid },
  { type: "national_id", pattern: gate("imsi", String.raw`\d{14,15}`) },
  // ── Vehicle ──────────────────────────────────────────────────────────────
  // VIN — 17 chars (no I/O/Q). The ISO-3779 check digit keeps the shape from
  // grabbing any 17-char token; a second rule catches EU VINs (whose check digit
  // is optional) only when the word "VIN" is present.
  { type: "national_id", pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g, validate: vinValid },
  { type: "national_id", pattern: gate("vin", String.raw`[A-HJ-NPR-Z0-9]{17}`) },
  // ── Passport MRZ (TD3 line 1) ────────────────────────────────────────────
  // The `<<` name separator is unmistakable — never occurs in ordinary text.
  { type: "national_id", pattern: /\bP[A-Z<][A-Z]{3}[A-Z<]{3,}<<[A-Z<]{2,}/g },
  // ── Badge / staff id ("badge B-58421", a business card's access number) ──
  // Keyword-gated; the shape (optional 1-3 letter prefix + 4-10 digits) is any
  // internal id, which is exactly why it never fires bare.
  { type: "national_id", pattern: gate("badge", String.raw`(?:[A-Za-z]{1,3}-)?\d{4,10}\b`) },
  // ── Latin America ────────────────────────────────────────────────────────
  // CPF/CNPJ/RUT/CURP/RFC live in rules.latam.ts + rules.international.us.ts (ONE
  // home each, with their check-digit validators — root rule 9). Only Argentina's
  // context-gated DNI remains here.
  { type: "national_id", pattern: gate("dni", String.raw`\d{1,2}\.?\d{3}\.?\d{3}`) },
  // ── Bank details ─────────────────────────────────────────────────────────
  // RIB (France) — context-gated AND mod-97 checksummed (belt and braces). UK
  // sort code and EU VAT have no usable checksum, so context-gated only.
  {
    // Bank COORDINATES ride the iban toggle (type bank_route → category "iban").
    type: "bank_route",
    pattern: gate("rib", String.raw`\d{5}[ ]?\d{5}[ ]?[0-9A-Za-z]{11}[ ]?\d{2}`),
    validate: ribValid,
  },
  { type: "bank_route", pattern: gate("sort code", String.raw`\d{2}-?\d{2}-?\d{2}`) },
  // EU VAT — keyword-gated (no universal checksum), internal spaces tolerated so a
  // grouped number ("VAT DE 811 907 980") still matches. `validate` requires ≥1 DIGIT
  // so the keyword doesn't drag a plain following WORD in ("TVA intracommunautaire" no
  // longer redacted "intracommunautaire"). The gate itself must ACCEPT that word,
  // though: the real French label is "N° TVA intracommunautaire : FR 16 …", and a
  // full word between keyword and value never passes the separator run — the value
  // leaked whenever its checksum ALSO failed (OCR'd digits defeat `frVat`). The FR
  // form ALSO fires keyword-free via the checksummed `frVat` shape rule in rules.ts.
  {
    // COMPANY identifier — its own toggle (type company_id).
    // ⚠️ `gate` compiles case-INSENSITIVELY, so `[A-Z]{2}` happily starts inside a
    // lowercase word ("in-tracom FR37 84") and the greedy {8,12} swallows the next
    // word's first letter ("FR00 753816290 d") — both spans then MASKED PARTIALLY,
    // leaking the digits left behind (parcours 13/08). Same remedy as the FR tax
    // block: the CASE is validated in code — an official VAT number carries only
    // UPPERCASE letters — and `longestValidPrefix` re-validates the clean prefix
    // once the swallowed lowercase token is trimmed.
    type: "company_id",
    pattern: gate(String.raw`(?:vat|tva)(?:\s+intracommunautaire)?`, String.raw`[A-Z]{2}(?:${SP}?[0-9A-Za-z]){8,12}`),
    validate: (m) => /^[A-Z]{2}/.test(m) && /\d/.test(m) && !/[a-zà-öø-ÿ]/.test(m),
  },
];
