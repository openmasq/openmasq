import type { RedactionRule } from "../../types";
import { gate } from "./rules.international.util";

// REFERENCE numbers a document names: a case, a claim, a policy, a booking, a plate, a bar
// number, a company registration. None is personal by its shape — « 2026-00318842 »,
// « KX7Q2M » — and each RE-IDENTIFIES the person whose name was just redacted (the court
// file, the insurer's claim, the car). So the KEYWORD is the anchor, like every gated scheme
// here, and the value must look like an identifier, not a quantity: a digit, ≥ 5 characters,
// never a date, a year or a year range (« the 2026-27 policy »), never an amount.
// NOT here, on purpose: a bare « ID » (« ID ABCDE1234F » is a PAN only with « PAN »,
// `rules.international.test.ts`), « ticket » (a support ticket is not personal,
// `rules.newDetectors.test.ts`). Ordered AFTER the health rules so « dossier médical : … »
// keeps its `health` category.
// Measured on the infra prose corpora (juridiqueEn/Us, courantEn/Us, courantFr): 13 of the 22
// values the NER pass still left were references of this kind.

/** An identifier, not a quantity. */
function isReference(m: string): boolean {
  const v = m.trim();
  if (v.length < 5 || !/\d/.test(v)) return false;
  if (/^\d{4}(?:[-/]\d{2,4})?$/.test(v)) return false; // a year, a year range
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(v)) return false; // a date
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(v)) return false; // an ISO date
  if (/^\d{1,2}[-/.]\d{1,2}$/.test(v)) return false; // a day and month (« charge on 03/01 »)
  if (/^\d{1,3}(?:[,.]\d{3})+(?:[,.]\d{2})?$/.test(v)) return false; // an amount
  return /[A-Za-z]/.test(v) || /[-:/]/.test(v) || /^\d{6,}$/.test(v);
}

/** Letters and digits joined by single dashes, colons or slashes (« 1:25-cv-08814 »). */
const REF = String.raw`[A-Za-z0-9](?:[A-Za-z0-9]|[-:/](?=[A-Za-z0-9])){4,23}(?![A-Za-z0-9])`;

const CASE_WORDS = String.raw`(?:case|docket|claim|policy|charge|civil[ ]action|booking|confirmation|complaint[ ]reference|incident|matter|r[ée]clamation|dossier|sinistre|affaire|plainte|contrat|police|r[ée]f[ée]rence[ ]client|employee[ ]id|staff[ ]id|member[ ]id|customer[ ]id)`;

export const REFERENCE_RULES: RedactionRule[] = [
  // A case, claim, policy, booking or customer reference after its keyword (« Case #: … »,
  // « Civil Action No. … », « Claim no. … », « réclamation n° … », « (ID EMP-20417) »).
  { type: "national_id", pattern: gate(CASE_WORDS, REF), validate: isReference },
  // « booking … reference KX7Q2M »: the generic « reference » only after a booking word,
  // never bare (« Référence du financement » has its own label, `labels/terms.ts`).
  {
    type: "national_id",
    pattern: gate(
      String.raw`(?:booking|reservation|r[ée]servation)[ ]reference|confirmed[ ][-–—][ ]reference`,
      REF,
    ),
    validate: isReference,
  },
  // A vehicle plate: letters AND digits, one optional joiner (« AKL-4492 », « 8KXV22 »).
  {
    type: "national_id",
    pattern: gate(
      String.raw`(?:license|licence|number)?[ ]?plate|plaque|immatriculation`,
      String.raw`[A-Za-z0-9]{1,4}[- ]?[A-Za-z0-9]{2,5}(?![A-Za-z0-9])`,
    ),
    validate: (m) => m.replace(/\W/g, "").length >= 5 && /\d/.test(m) && /[A-Za-z]/.test(m),
  },
  // A lawyer's bar number (« State Bar No. 031775 », « (SBN 301884) »).
  {
    type: "national_id",
    pattern: gate(String.raw`bar[ ](?:no|number|#)|sbn`, String.raw`\d{4,8}(?!\d)`),
  },
  // A company registration: UK Companies House (8 digits, or 2 letters + 6), the Dutch KvK.
  {
    type: "company_id",
    pattern: gate(
      String.raw`company[ ](?:number|no|registration[ ]number)|under[ ]number|companies[ ]house|kvk`,
      String.raw`(?:[A-Za-z]{2}\d{6}|\d{8})(?![A-Za-z0-9])`,
    ),
  },
];
