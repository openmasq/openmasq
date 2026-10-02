import type { Messages } from "@openmasq/i18n";
import type { ExtractedFile } from "@openmasq/redact/documents";

type Copy = Messages["documents"];

/**
 * The extraction failure, worded in the user's language. `@openmasq/redact` stays pure: it
 * returns a stable `errorCode` (+ numbers) beside its French `error`; this is where the
 * code becomes a sentence. An absent or unknown code keeps the engine's text unchanged,
 * and so does a code whose numbers are missing: never a sentence with a hole in it.
 *
 * Only the WORDS change. `blocked`, `text`, `rawCause` and every other field pass through,
 * so a refusal stays a refusal (fail closed) whatever the language.
 */
export function localizeExtracted(file: ExtractedFile, t: Copy): ExtractedFile {
  const error = file.error ? localizedError(file, t) : null;
  return error ? { ...file, error } : file;
}

function localizedError(f: ExtractedFile, t: Copy): string | null {
  const p = f.errorParams ?? {};
  switch (f.errorCode) {
    case "file_too_large":
      return p.mb != null ? t.refused.fileTooLarge(p.mb) : null;
    case "executable":
      return t.refused.executable;
    case "type_mismatch":
      return t.refused.typeMismatch;
    case "image_too_large":
      return p.width != null && p.height != null ? t.refused.imageTooLarge(p.width, p.height) : null;
    case "image_unreadable":
      return t.refused.imageUnreadable;
    case "zip_entries":
      return p.entries != null ? t.refused.zipEntries(p.entries) : null;
    case "zip_too_large":
      return t.refused.zipTooLarge;
    case "zip_ratio":
      return t.refused.zipRatio;
    case "unsupported_type":
      return t.unsupportedType(p.ext ?? "");
    case "ocr_failed":
    case "ocr_engine_missing":
    case "ocr_engine_incompatible":
    case "pdf_renderer_missing":
    case "pdf_renderer_incompatible": {
      if (f.kind === "image" && f.errorCode === "ocr_failed") return t.imageOcrFailed;
      const cause = ocrCause(f.errorCode, t);
      return f.kind === "pdf" ? t.scanPdf(cause) : cause;
    }
    default:
      return null;
  }
}

function ocrCause(
  code: "ocr_failed" | "ocr_engine_missing" | "ocr_engine_incompatible" | "pdf_renderer_missing" | "pdf_renderer_incompatible",
  t: Copy,
): string {
  switch (code) {
    case "ocr_failed":
      return t.ocr.failed;
    case "ocr_engine_missing":
      return t.ocr.engineMissing;
    case "ocr_engine_incompatible":
      return t.ocr.engineIncompatible;
    case "pdf_renderer_missing":
      return t.ocr.pdfRendererMissing;
    case "pdf_renderer_incompatible":
      return t.ocr.pdfRendererIncompatible;
  }
}
