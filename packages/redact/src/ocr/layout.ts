import { reconstructLayout, type LayoutBlock, type LayoutRun, type PdfTextItem } from "../documents/pdfLayout";

/**
 * Minimum per-word OCR confidence (0–100 scale; Tesseract native, docTR = CTC ×100) below
 * which a recognised word is DROPPED — a low floor (**0.25**) that removes only near-garbage
 * misrecognitions (which would otherwise pollute the text + trip false-positive PII
 * detections) while KEEPING the mid/high-confidence range. Kept deliberately LOW: for a
 * privacy product a dropped word is a potential LEAK (a real value never redacted — e.g. a
 * scanned name OCR'd at low confidence), so we only shed what is almost certainly not real
 * text. A word with NO confidence is kept. Used as the default by BOTH the text extraction
 * (`ocrWordsToText`) AND the box painting (`imageRedact` `ocrWordsToLayout`), so the run↔box
 * mapping stays aligned.
 */
export const OCR_MIN_WORD_CONFIDENCE = 25;

/** One OCR word with its pixel bounding box. Tesseract origin = TOP-left (y DOWN). */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Tesseract per-word confidence 0–100 (optional). */
  confidence?: number;
}

/**
 * Layout-aware OCR text PLUS the machinery to map a span back to its source words.
 * REUSES the pdf.js geometric reconstruction (`reconstructLayout`): a TRUE 2D
 * character grid — group words into lines, place each at its true X column — so a
 * scanned FORM's `label : value` pairs, table columns and a top-right address block
 * survive OCR at their real position instead of scrambling into a flat dump. That
 * adjacency is what lets `detectLabeledFields` / `tabular` / `detectAddresses` (and
 * the LLM + local-NER detectors, all consuming this text) type each value correctly.
 *
 * Returns the text, the offset→word map (`runs`, whose `itemIndex` indexes the
 * returned `words`) and the kept `words` with their ORIGINAL pixel boxes — so a
 * consumer can paint the redaction on the scan (see `imageRedact.ts`). Values are
 * verbatim word strings; only ORDER + inserted whitespace change → reversible. Pure.
 *
 * Tesseract's origin is TOP-left (y grows DOWN); `reconstructLayout` expects the
 * pdf.js bottom-left convention (y grows UP), so we NEGATE y FOR ORDERING ONLY — the
 * returned `words` keep their original top-left boxes for painting. Column-gap
 * thresholds are relative to word HEIGHT → independent of the OCR raster DPI. Words
 * below `minConfidence` are dropped (default {@link OCR_MIN_WORD_CONFIDENCE} = 25/0.25 —
 * a LOW floor that sheds near-garbage misrecognitions but keeps the mid-range, since a
 * dropped real value would leak).
 */
export function ocrWordsToLayout(
  words: OcrWord[],
  minConfidence = OCR_MIN_WORD_CONFIDENCE,
): { text: string; runs: LayoutRun[]; words: OcrWord[]; blocks: LayoutBlock[] } {
  const kept = words.filter(
    (w) => w.text && w.text.trim() && (w.confidence ?? 100) >= minConfidence,
  );
  const items: PdfTextItem[] = kept.map((w) => {
    const h = Math.max(1, w.y1 - w.y0);
    return { str: w.text, transform: [1, 0, 0, h, w.x0, -w.y0], width: Math.max(1, w.x1 - w.x0), height: h };
  });
  // `blocks` = the vertical BANDS the reconstruction already boxes (negated-Y space,
  // like the transforms above) — free segmentation the OCR layer used to discard.
  const { text, runs, blocks } = reconstructLayout(items);
  return { text, runs, words: kept, blocks };
}

/** Layout-aware OCR text only (the string). Thin wrapper over {@link ocrWordsToLayout}. */
export function ocrWordsToText(words: OcrWord[], minConfidence = OCR_MIN_WORD_CONFIDENCE): string {
  return ocrWordsToLayout(words, minConfidence).text;
}
