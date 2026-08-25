import type { RedactionRule } from "../../types";
import { gate } from "./rules.international.util";

// Health / medical data → category "health" (RGPD Art. 9 special category).
//
// Free-form health data (a diagnosis in prose, a medication, a condition) has no
// fixed shape and is the MODEL detector's job (see `model/detect.ts`, which now
// tags → HEALTH). These regex rules add the STRUCTURED health data that DOES have a
// shape — but a bare `A+`, `F32` or 6-digit number is far too common, so EVERY rule
// is CONTEXT-GATED (fires only when a health keyword sits just before it). No bare
// generic shape, in line with the engine's false-positive discipline.
export const HEALTH_RULES: RedactionRule[] = [
  // Blood group — A / B / AB / O + rhesus sign (or written positif/négatif), only
  // after a blood-type keyword. (No trailing \b: a boundary between `+`/`-` and a
  // following space is not a word boundary, so it would never match `A+`.)
  {
    type: "health",
    pattern: gate(
      // The scheme word in the languages the corpora exercise — each is the
      // specific BLOOD-GROUP label, never a generic medical word.
      "groupe sanguin|blood type|blood group|rh[eé]sus|rh|blutgruppe|" +
        "grupo sangu[íi]neo|tipo sangu[íi]neo|gruppo sanguigno|bloedgroep",
      // The sign class carries the TYPOGRAPHIC minus (U+2212) and en-dash a PDF/word
      // processor substitutes for the ASCII hyphen — « A− » shipped in clear.
      String.raw`(?:AB|A|B|O)\s?(?:[+\-−–]|positif|négatif|positive|negative|positivo|negativo|positiv|negativ|positief|negatief|pos|neg)`,
    ),
  },
  // Medical record number (MRN) — an id right after a medical-record keyword.
  {
    type: "health",
    pattern: gate(
      "mrn|dossier médical|dossier medical|medical record|numéro de dossier|numero de dossier|record number|numéro patient|" +
        // Same MEDICAL-RECORD label elsewhere — the specific chart/record word,
        // never a bare "dossier"/"nummer" that any admin file carries.
        "krankenakte|patientennummer|historia cl[íi]nica|cartella clinica|prontu[áa]rio|pati[ëe]ntnummer",
      String.raw`[A-Za-z]?\d{5,10}`,
    ),
  },
  // The PRACTITIONER's registry ids — RPPS (11 digits), ADELI (9), FINESS (9, the
  // establishment). They identify a named health professional and sit in the header of
  // every ordonnance / compte rendu, beside the patient's own data. Bare digit runs, so
  // gated on the scheme word like everything else here. Category `health` keeps them on
  // the RGPD Art. 9 toggle — the document they head IS medical.
  { type: "health", pattern: gate("rpps", String.raw`\d{11}`) },
  { type: "health", pattern: gate("adeli|finess", String.raw`\d{9}`) },
  // ICD-10 diagnosis code (`F32`, `E11.9`) — only after a diagnosis keyword.
  {
    type: "health",
    pattern: gate(
      // The classification acronyms carry their REVISION and often a closing paren —
      // « (ICD-10) : E11.9 », « (CIM-10) », « (CID/ICD): M54.5 » — and the gate's
      // separator class has neither digits nor parens, so the keyword ITSELF absorbs
      // them (the PDL `\)?` discipline). `cid` is the PT/BR classification name.
      String.raw`(?:cim|icd|cid)(?:[ -]?1[01])?\)?|diagnostic|code diagnostic|diagnosis|diagnose|diagn[óo]stico|diagnosi`,
      String.raw`[A-TV-Z]\d{2}(?:\.\d{1,2})?`,
    ),
  },
];
