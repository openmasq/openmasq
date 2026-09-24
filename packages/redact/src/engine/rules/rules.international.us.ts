import type { RedactionRule } from "../../types";
import { gate, re } from "./rules.international.util";
import {
  abaRoutingValid,
  caSinValid,
  usNpiValid,
} from "../validators/validators.international";
import { mxClabeValid, mxCurpValid } from "../validators/validators.world";
import { US_STATE_ABBR_TO_NAME, US_STATE_NAME_TO_ABBR } from "../geo/usStates";

// North-American identity / financial schemes ported from presidio-ts. All map
// to the "national_id" category (on by default). US SSN and US EIN are already
// covered by the built-in RULES, so they are NOT duplicated here.
// A ZIP code has no shape a rule may trust on its own: five digits is a price, a count,
// a year and a day. `addresses/` takes one inside a complete street address; the Nemotron
// corpus showed what that leaves out — 201 postcodes on their own, written three ways:
//   « Antioch, CA, 94509 »        a state CODE, then a comma, then the ZIP
//   « Jeddo, Michigan, 48032 »    the state NAME
//   « Los Gatos, postcode 95030 » the word itself as a label
// Each anchor is literal — a real state (`geo/usStates.ts`, plus the territories the USPS
// serves) or the label word — which is what lets five banal digits fire. A state code that
// is also a word (« OR », « IN », « ME », « OK ») counts only after the comma prose does not
// put before it. « Tulsa, 74146 » — city, ZIP — has no anchor a rule may trust and is left
// to the address detector and the model.
const US_ZIP_AREAS = ["DC", "PR", "VI", "GU", "AS", "MP"];
const US_STATE_ALT = [...new Set([...Object.keys(US_STATE_ABBR_TO_NAME), ...US_ZIP_AREAS])].join("|");
const US_STATE_NAMES = Object.keys(US_STATE_NAME_TO_ABBR).sort((a, b) => b.length - a.length).join("|");
const ZIP = String.raw`\d{5}(?:-\d{4})?\b`;

export const US_RULES: RedactionRule[] = [
  // « , CA 94509 » / « , CA, 94509 » — the code, comma-anchored.
  { type: "zipcode", pattern: re(String.raw`(?<=,[ ]{0,3}(?:${US_STATE_ALT}),?[ ]{1,2})${ZIP}`) },
  // « Michigan, 48032 » — the name; a state name followed by a comma and five digits is
  // an address line and nothing else.
  { type: "zipcode", pattern: re(String.raw`(?<=\b(?:${US_STATE_NAMES}),?[ ]{1,2})${ZIP}`, "gi") },
  // « postcode 95030 », « a postcode of 95030 », « ZIP: 95030 » — the label is the gate.
  { type: "zipcode", pattern: re(String.raw`(?<=\b(?:post(?:al)?[ ]?code|zip(?:[ ]?code)?)(?:[ ]+(?:of|is|was))?[ :=]{1,3})${ZIP}`, "gi") },
  // Canada SIN — spaced/dashed form, Luhn-validated (bare \d{9} dropped: too common).
  {
    type: "national_id",
    pattern: re(String.raw`\b[1-79]\d{2}([- ])\d{3}\1\d{3}\b`),
    validate: caSinValid,
  },
  // US NPI (healthcare provider) — spaced form is distinctive; bare 10-digit is
  // context-gated. Both confirmed by the NPI Luhn (80840 prefix) checksum.
  {
    type: "national_id",
    pattern: re(String.raw`\b[12]\d{3}[ -]\d{3}[ -]\d{3}\b`),
    validate: usNpiValid,
  },
  {
    type: "national_id",
    pattern: gate("npi|national provider", String.raw`[12]\d{9}`),
    validate: usNpiValid,
  },
  // US ABA routing — dashed form distinctive; bare 9-digit gated. Weighted mod-10.
  {
    type: "bank_route",
    pattern: re(String.raw`\b[0123678]\d{3}-\d{4}-\d\b`),
    validate: abaRoutingValid,
  },
  {
    type: "bank_route",
    pattern: gate("aba|routing|bank routing|aba routing", String.raw`[0123678]\d{8}`),
    validate: abaRoutingValid,
  },
  // A PAYMENT CARD under an EXPLICIT card label, WITHOUT the Luhn check. The shape rules
  // above (`rules.ts`) require the checksum, and that is right for a bare run — but a
  // number introduced by « credit/debit card number », « Kartennummer », « tarjeta » IS
  // the card whether or not its check digit adds up: measured on 2026-09-07
  // (`bench/spans/`), 682 of Nemotron-PII's 764 annotated cards and 62 of Gretel's 118
  // fail Luhn (synthetic corpora invent digits), and the product found a quarter of them
  // while a label-reading detector found 97 %. Real cards pass Luhn and are claimed by the
  // shape rules first (`RULES` order); this only adds what a label vouches for.
  {
    type: "card",
    pattern: gate(
      String.raw`(?:credit|debit|credit/debit|credit debit|payment|bank)\s+card(?:\s+(?:number|no|n[°º]))?|card\s+(?:number|no|n[°º])|kartennummer|kreditkarte(?:nnummer)?|n[úu]mero\s+de\s+tarjeta|tarjeta\s+de\s+cr[ée]dito|numero\s+(?:di\s+)?carta|carta\s+di\s+credito|kaartnummer|kortnummer|creditcard(?:nummer)?|num[ée]ro\s+de\s+carte|carte\s+(?:bancaire|de\s+cr[ée]dit)`,
      String.raw`\d(?:[   -]?\d){11,18}`,
    ),
  },
  // US bank account — a bare 8–17 digit run has no checksum, so ONLY when a bank
  // context word precedes it (else it would eat every long number).
  {
    type: "bank_route",
    pattern: gate(
      "account number|bank account|checking account|savings account|account no|acct",
      String.raw`[0-9]{8,17}`,
    ),
  },
  // US passport — next-generation (letter + 8 digits). A bare letter+8-digits is FAR
  // too common (order refs `R00123456`, SKUs `C10000042`), so — like the legacy
  // 9-digit form below — it only fires with passport context nearby.
  {
    type: "national_id",
    pattern: gate("passport|passport no|passport number", String.raw`\b[A-Z][0-9]{8}\b`),
  },
  {
    type: "national_id",
    pattern: gate("passport|passport no|passport number", String.raw`[0-9]{9}`),
  },
  // US DEA / medical-license — 2 letters + 7 digits, gated on medical context.
  {
    type: "national_id",
    pattern: gate(
      "dea|medical|medical license|certificate",
      String.raw`[A-Za-z][A-Za-z]\d{7}`,
    ),
  },
  // ── Beyond the presidio port ──────────────────────────────────────────────
  // US ITIN — 9XX-GG-XXXX with the issued group ranges (70-88, 90-92, 94-99). The
  // dashed 3-2-4 shape is the classic SSN false-positive → gated like SSN is.
  {
    type: "national_id",
    pattern: gate(
      "itin|individual taxpayer|taxpayer identification",
      String.raw`9\d{2}[- ]?(?:7\d|8[0-8]|9[0-24-9])[- ]?\d{4}\b`,
    ),
  },
  // US Medicare MBI — 11 chars, strict positional structure (C A AN N A AN N A A N N,
  // letters exclude S/L/O/I/B/Z). Structured but code-like → gated on medicare/mbi.
  {
    type: "national_id",
    pattern: gate(
      "medicare|mbi|beneficiary identifier",
      String.raw`[1-9][AC-HJKMNP-RT-Yac-hjkmnp-rt-y][AC-HJKMNP-RT-Yac-hjkmnp-rt-y0-9]\d-?[AC-HJKMNP-RT-Yac-hjkmnp-rt-y][AC-HJKMNP-RT-Yac-hjkmnp-rt-y0-9]\d-?[AC-HJKMNP-RT-Yac-hjkmnp-rt-y]{2}\d{2}\b`,
    ),
  },
  // US driver's license — per-state chaos (letter+digits / bare digits, 5-13 chars):
  // no shape is safe, so the whole family fires only on licence context.
  {
    type: "national_id",
    pattern: gate(
      "driver'?s? licen[cs]e|driving licen[cs]e|dl no|dmv",
      String.raw`[A-Za-z]\d{6,12}\b|\d{7,12}\b|[A-Za-z]{2}\d{5,10}\b`,
    ),
  },
  // Canada passport — 2 letters + 6 digits, a generic code shape → gated.
  {
    type: "national_id",
    pattern: gate("passport|passeport", String.raw`[A-Za-z]{2}\d{6}\b`),
  },
  // Mexico — CURP: 18 chars with a strict positional structure AND a dictionary
  // check digit → validated, fires bare. RFC (13 alnum) is looser → gated.
  {
    type: "national_id",
    pattern: re(String.raw`\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b`),
    validate: mxCurpValid,
  },
  {
    type: "national_id",
    pattern: gate("rfc", String.raw`[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b`),
  },
  // Mexico — CLABE (18 digits, weighted 3-7-1 mod-10 check). A bare 18-digit run is
  // banal even with a 1/10 checksum → gated + validated.
  {
    type: "bank_route",
    pattern: gate("clabe", String.raw`\d{18}\b`),
    validate: mxClabeValid,
  },
];
