import type { ExtractedFile } from "../../host/files";
import { pushDebug } from "../../state/debug";

/**
 * Trace au Journal de débogage COMMENT le texte d'un document a été obtenu (couche texte
 * PDF, docTR, Tesseract, hybride) + le temps mesuré. No-op quand le fichier n'a pas eu
 * besoin d'OCR, ou quand la capture est éteinte (`pushDebug` s'en charge).
 *
 * ⚠️ `convId` est OBLIGATOIRE, et « pas encore de conversation » n'est pas « pas de
 * conversation » : une entrée émise sans `conv` est un événement d'APP — montrée dans
 * TOUTES les conversations, pour toujours (l'anneau est persisté). C'est exactement ce qui
 * arrivait : l'OCR et le redaction d'un document déposé sur un chat neuf hantaient le
 * journal de chaque conversation (11/08/2026). L'appelant résout donc sa cible : l'id
 * NOMMÉ par « Demander » (la conversation cible n'est pas celle à l'écran), sinon la
 * conversation ouverte, sinon `DRAFT_CONV` — que le premier envoi adopte
 * (`sendOrchestrator` → `adoptDraftDebug`).
 */
export function logOcrDebug(f: ExtractedFile, convId: string): void {
  // Un ÉCHEC d'extraction porte enfin sa cause brute au journal : l'UI garde la phrase
  // allow-listée (`cleanErr`), le journal — la seule surface de diagnostic — reçoit
  // `rawCause` (« l'OCR ne marche pas sur mon Mac » : un paquet natif manquant et un PDF
  // corrompu n'étaient qu'une même phrase, audit 13/08).
  if (f.error) {
    pushDebug(
      { type: "tool", name: "Extraction · échec", ok: false, args: f.name, error: f.rawCause ?? f.error },
      convId,
    );
  }
  const o = f.ocr;
  if (!o) return;
  // A PDF read via its text layer needs NO OCR — name it as extraction, not OCR, so the
  // log tells the truth about how each document's text was obtained.
  const name =
    o.engine === "pdf-text"
      ? "Extraction · couche texte PDF"
      : o.engine === "doctr"
        ? "OCR · docTR (latin)"
        : o.engine === "tesseract"
          ? `OCR · Tesseract${o.fellBack ? " (repli docTR)" : ""}`
          : o.engine === "doctr+tesseract"
            ? "OCR · docTR + Tesseract"
            : `OCR · ${o.engine}`;
  const bits = [`${o.ms} ms`];
  if (o.pages) bits.push(`${o.pages} page(s)`);
  if (o.confidence != null) bits.push(`conf ${Math.round(o.confidence * 100)}%`);
  pushDebug({ type: "tool", name, ok: true, args: f.name, result: bits.join(" · ") }, convId);
}
