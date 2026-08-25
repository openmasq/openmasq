// DOCUMENT-TYPE heuristic for IDENTITY DOCUMENTS (CNI / passeport / titre de séjour).
//
// Measured on a real scanned carte d'identité: the OCR text carries every sensitive value
// yet the pipeline caught 2 of 5 — because an identity card prints its fields WITHOUT the
// colon discipline every other detector relies on ("GT Nom SABOURDIN"), and OCR mangles
// the labels themselves ("Néle)le : 23.09.1996" for "Né(e) le"). Loosening the general
// labeled-field detector to colon-less labels would be an FP disaster in prose ("nom
// commun", "le nom de la rue"…).
//
// So the loosening is GATED ON THE DOCUMENT TYPE: these patterns only run when the text
// carries an identity-document HEADER. Inside that context, "Nom <CAPS>" IS the holder's
// surname — that is what the document format prescribes — and the residual FP risk is
// bounded by three belts: the header gate, ALL-CAPS-only values (prose writes "Nom
// Commun", a card prints "CHANDREL"), and the shared generic-term deny-list.
import type { Detection } from "../types";
import { isStopword, isGenericTerm } from "../model/detect";

/** Identity-document header, tolerant to OCR word-gluing ("CARTENATIONALE D'IDENTITÉ"). */
const HEADER_RE =
  /CARTE\s*NATIONALE\s*D\s*['’]?\s*IDENTIT|PASSEPORT|TITRE\s*DE\s*S[ÉE]JOUR|R[ÉE]PUBLIQUE\s*FRAN[ÇC]AISE/iu;

/** An ALL-CAPS value run (accents + compounds), 2-40 chars — how a card prints a value. */
const CAPS = "[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’ -]{1,39}";

interface FieldRule {
  re: RegExp;
  category: string;
}

const FIELDS: FieldRule[] = [
  // "Nom CHANDREL" / "Nom: CHANDREL" / "Nom d'usage CHANDREL" — colon OPTIONAL, and up
  // to 8 glued junk chars tolerated after the label ("Nomis)" style OCR orphans).
  { re: new RegExp(String.raw`\bNoms?\b(?:\s*d\s*['’]?\s*usage)?[\S]{0,8}?[\s:：]+(${CAPS})`, "gu"), category: "NAME" },
  // "Prénom(s): JULIEN LOUIS" and its OCR orphan "Prénomis): JULIEN LOUIS".
  { re: new RegExp(String.raw`\bPr[ée]nom[\S]{0,8}?[\s:：]+(${CAPS})`, "gu"), category: "NAME" },
  // "Né(e) le : 23.09.1996" and the garbled "Néle)le : 23.09.1996" — the label survives
  // as "Né" + up to 8 mangled chars + an optional stray "le".
  { re: /\bN[ée][\S]{0,8}?\s*(?:le)?\s*[:：]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gu, category: "DOB" },
  // "à: RENNES" / "a: RENNES" (the birthplace line). The bare "a:" would be reckless in
  // prose — here the header gate + the ALL-CAPS requirement carry the precision.
  { re: new RegExp(String.raw`(?<![\p{L}])[àa]\s*[:：]\s*(${CAPS})`, "gu"), category: "CITY" },
];

/** Junk an OCR value run may drag in: trailing single letters / short particles. */
function cleanCaps(v: string): string {
  return v.replace(/\s+(?:RF|SR|GT|[A-Z])$/u, "").trim();
}

/**
 * Identity-document fields, active ONLY when the text carries an identity-document
 * header. Values are ALL-CAPS runs (or a date for DOB) — never prose.
 */
export function detectIdentityDocFields(text: string): Detection[] {
  if (!text || !HEADER_RE.test(text)) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const f of FIELDS) {
    for (const m of text.matchAll(f.re)) {
      const value = f.category === "DOB" ? (m[1] ?? "").trim() : cleanCaps(m[1] ?? "");
      if (value.length < 2) continue;
      if (isStopword(value) || isGenericTerm(value)) continue;
      const key = `${f.category}::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value, category: f.category, start: m.index });
    }
  }
  return out;
}
