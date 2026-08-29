import { replaceStandalone } from "@openmasq/redact";
import type { PdfReplacement } from "../pdf/pdfReplacements";

/**
 * Redacted text WITHOUT re-running the model: the drop-time `replacements`
 * (real→fake) are applied deterministically to the extracted text. Longest real
 * first so a value isn't split by a shorter substring, and word-boundary-safe
 * (`replaceStandalone` — a short fake "IE" must not corrupt "INGÉNIEURS"),
 * mirroring the model-facing `applyVault` + the PDF paint.
 *
 * `undefined` replacements = redaction wasn't threaded → return null so the caller
 * uses its async fallback. An EMPTY array = redaction ran and found nothing → the
 * redacted text IS the original (still no re-run).
 */
export function redactedFromReplacements(
  wireText: string,
  replacements: PdfReplacement[] | undefined,
): string | null {
  if (!wireText || replacements === undefined) return null;
  let t = wireText;
  for (const r of [...replacements].sort((a, b) => b.real.length - a.real.length)) {
    if (r.real) t = replaceStandalone(t, r.real, r.fake);
  }
  return t;
}
