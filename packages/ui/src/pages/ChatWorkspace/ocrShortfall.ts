import type { Attachment } from "./Composer";

/**
 * An attachment whose OCR STOPPED at the cap (10 pages by default) — the chip
 * must SAY so, and offer « Lire tout ».
 *
 * The cap exists for a good reason (a scan reads in seconds PER PAGE: with no
 * bound, a 300-page document freezes the send for long minutes with nobody
 * having chosen that) — but truncating IN SILENCE is the sin this product refuses
 * everywhere else: the user believes their document was read, the model answers
 * from a third of the file, and the only trace is a marker buried in text nobody re-reads.
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
