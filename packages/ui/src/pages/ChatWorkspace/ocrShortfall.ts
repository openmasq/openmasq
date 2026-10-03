import type { Attachment } from "./Composer";

/**
 * An attachment whose OCR STOPPED short of its last page — the chip must SAY so, and
 * offer « Lire tout ».
 *
 * A PDF is read WHOLE now (`@openmasq/redact` `pdfExtract.ts`: every page OCR must read,
 * or a refusal before the first one, or an error), so no new extraction lands here. What
 * still does is a record read under the FORMER 10-page cap (a library re-attach carries its
 * stored `ocr`): truncating IN SILENCE is the sin this product refuses everywhere else, so
 * such a record keeps saying it, and the re-read is the whole-document extraction.
 */
export function ocrShortfall(
  a: Pick<Attachment, "ocr" | "extracting" | "error">,
): { read: number; total: number } | null {
  if (a.extracting || a.error) return null;
  const pages = a.ocr?.pages;
  const total = a.ocr?.pagesTotal;
  if (!pages || !total || total <= pages) return null;
  return { read: pages, total };
}
