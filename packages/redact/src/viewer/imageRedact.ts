// Visual redaction of a SCANNED image (or a scanned-PDF page) by REUSING the OCR
// word boxes — the image analogue of `pdfRedact.ts` (which uses the pdf.js text
// layer). Tesseract already gives every word's pixel box; instead of discarding
// them after building the text, we map each redacted value back to the words that
// spell it → their boxes → paint an opaque highlight + the fake on top. The mapping
// core (`matchValueToBoxes`) is PURE + unit-tested; `renderRedactedImage` needs a
// canvas (browser-only, like pdfRedact). VIEWER-ONLY: input bytes read once.
import { ocrWordsToLayout, type OcrWord } from "../ocr/layout";
import type { LayoutRun } from "../documents/pdfLayout";
// The pure mapping core (`matchValueToBoxes`) lives in `pdfMatch.ts` with the rest of
// the correlation logic (ONE implementation - the PDF painter's scanned-page fallback
// reuses it); re-exported here so this subpath's public API is unchanged.
import { matchValueToBoxes, type PdfReplacement, type RedactBox } from "./pdfRedact";
export { matchValueToBoxes };
import { paintScanBox } from "./paintBox";

export type { OcrWord } from "../ocr/layout";

export interface RenderRedactedImageOptions {
  /** The scanned image bytes (png/jpg/…). */
  bytes: Uint8Array;
  /** Tesseract words with ORIGINAL pixel boxes (from `ocrImageLayout`). */
  words: OcrWord[];
  /** Pre-computed real→fake map for the text (`pdfReplacements`/`vaultReplacements`). */
  replacements: PdfReplacement[];
  /** REAL values the user chose to keep in clear (before-send un-redact). */
  reveal?: ReadonlySet<string>;
  minConfidence?: number;
}

export interface RenderedImage {
  canvas: HTMLCanvasElement;
  boxes: RedactBox[];
}

/**
 * Paint the redaction onto the SCAN: draw the source image, then for each
 * non-revealed box an opaque highlight (tone) + the fake on top. OCR boxes are in
 * IMAGE px (top-left origin) = canvas coords → no transform needed. Browser-only
 * (canvas). The text (and its word mapping) is rebuilt from `words` with the SAME
 * `ocrWordsToLayout` used at extraction, so it matches what was redacted.
 */
export async function renderRedactedImage(o: RenderRedactedImageOptions): Promise<RenderedImage> {
  // Undefined ⇒ the SAME default floor the extraction used (OCR_MIN_WORD_CONFIDENCE), so the
  // kept words — hence the run↔box mapping — match the text that was redacted. Passing 0 here
  // would keep low-confidence words the text dropped → misaligned boxes.
  const { text, runs, words } = ocrWordsToLayout(o.words, o.minConfidence);
  const boxes = matchValueToBoxes(
    o.replacements,
    text,
    runs,
    words.map((w) => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 })),
    o.reveal,
  );

  const bmp = await createImageBitmap(new Blob([o.bytes as BlobPart]));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();

  for (const box of boxes) {
    if (box.revealed) continue;
    paintScanBox(ctx, box);
  }
  return { canvas, boxes };
}
