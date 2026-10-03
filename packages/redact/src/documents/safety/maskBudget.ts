// How much text one document may hold and still be masked IN FULL — the single home of
// the size limits on what a person attaches (rule 9). A document is masked whole or
// refused: never a first slice. The measure is CHARACTERS (what the detector reads);
// pages are how the copy speaks to a person, and how a scan is sized before its OCR.

/** Cost of masking 1,000 characters end to end with the default engine: offline NER
 *  (200–235 ms, `chunkSize` 1000) plus the pseudonymisation pass (~13 ms). Measured on an
 *  Apple M1 over `__cases__/longPasteDoc.ts` (20k–500k chars for the NER, up to 2M for the
 *  engine; both linear). An estimate for the copy and the limits below, never a promise: a
 *  slower machine takes longer, which the timeout's margin absorbs. */
const MASK_MS_PER_1K_CHARS = 250;

/** Above this the chip warns that masking will take a while (≈ 20 s). */
export const LONG_MASK_CHARS = 80_000;

/** Above this the document is REFUSED (≈ 4 min of masking measured, more on a slower
 *  machine). Masking it partially is not an option the product offers. */
export const MAX_MASK_CHARS = 1_000_000;

/** A dense page of text: the copy's « ≈ N pages », and the pre-OCR estimate of a scan
 *  (`../pdfExtract.ts`), whose text is unknown until its pages are read. */
export const CHARS_PER_PAGE = 3_000;

/** Floor of the drop-time masking timeout: a short document on a cold worker (model load). */
const MASK_TIMEOUT_FLOOR_MS = 2 * 60_000;
/** Margin over the estimate before a masking run is declared stuck. */
const MASK_TIMEOUT_FACTOR = 3;

/** Estimated masking time for `chars` characters, in ms. */
export function estimateMaskMs(chars: number): number {
  return Math.ceil((Math.max(0, chars) / 1000) * MASK_MS_PER_1K_CHARS);
}

/** Approximate page count of `chars` characters (at least 1). */
export function approxPages(chars: number): number {
  return Math.max(1, Math.round(chars / CHARS_PER_PAGE));
}

/** What masking a text this long means for the person: nothing to say, a wait to
 *  announce (in whole minutes, at least 1), or a refusal (with its size in pages). */
export type MaskPlan =
  | { kind: "ok" }
  | { kind: "long"; minutes: number }
  | { kind: "refuse"; pages: number };

export function maskPlan(chars: number): MaskPlan {
  if (chars > MAX_MASK_CHARS) return { kind: "refuse", pages: approxPages(chars) };
  if (chars > LONG_MASK_CHARS) return { kind: "long", minutes: Math.max(1, Math.ceil(estimateMaskMs(chars) / 60_000)) };
  return { kind: "ok" };
}

/** Deadline for masking a whole document of `chars` characters at drop time. Past it the
 *  run is abandoned and the file is NOT sendable (the caller marks it failed). */
export function maskTimeoutMs(chars: number): number {
  return Math.max(MASK_TIMEOUT_FLOOR_MS, MASK_TIMEOUT_FACTOR * estimateMaskMs(chars));
}

/** Backstop of one whole extraction before its page count is known (text layer, a short
 *  scan, a cold OCR engine): a worker stuck past it is abandoned and the file fails. */
const EXTRACT_BASE_MS = 6 * 60_000;
/** …plus this per page OCR must read. A scan page takes seconds on a recent machine and
 *  tens of seconds on a low-power one (Intel, WASM Tesseract): a generous ceiling, never
 *  the nominal pace. With `MAX_MASK_CHARS / CHARS_PER_PAGE` pages at most, the backstop
 *  stays bounded. */
const EXTRACT_MS_PER_OCR_PAGE = 60_000;

/** Deadline of an extraction that OCRs `ocrPages` pages (0 while the count is unknown).
 *  Past it the extraction is abandoned: the file is in error, never sent in part. */
export function extractTimeoutMs(ocrPages: number): number {
  return EXTRACT_BASE_MS + Math.max(0, ocrPages) * EXTRACT_MS_PER_OCR_PAGE;
}
