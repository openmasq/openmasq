import type { ExtractedFile } from "../../host/files";
import { pushDebug } from "../../state/debug/debug";

/**
 * Traces to the debug Log HOW a document's text was obtained (PDF text layer,
 * docTR, Tesseract, hybrid) + the measured time. No-op when the file needed no
 * OCR, or when capture is off (`pushDebug` handles that).
 *
 * ⚠️ `convId` is MANDATORY, and "not yet a conversation" is not "no
 * conversation": an entry emitted with no `conv` is an APP event — shown in
 * EVERY conversation, forever (the ring is persisted). That is exactly what was
 * happening: the OCR and redaction of a document dropped on a fresh chat haunted the
 * log of every conversation (11/08/2026). The caller therefore resolves its target: the id
 * NAMED by « Demander » (the target conversation isn't the one on screen), otherwise the
 * open conversation, otherwise `DRAFT_CONV` — which the first send adopts
 * (`sendOrchestrator` → `adoptDraftDebug`).
 */
export function logOcrDebug(f: ExtractedFile, convId: string): void {
  // An extraction FAILURE finally carries its raw cause to the log: the UI keeps the
  // allow-listed phrase (`cleanErr`), the log — the only diagnostic surface — gets
  // `rawCause` ("OCR doesn't work on my Mac": a missing native package and a corrupt
  // PDF were the same phrase, audit 13/08).
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
