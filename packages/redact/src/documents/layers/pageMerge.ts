// Which reading becomes a page's PRIMARY text in a DIGITAL PDF — the text that is masked and
// SENT. A digital PDF keeps its text layer as primary; OCR is the additive detection layer
// (`ocrText`). But a page whose layer is thin or debris (a scanned insert, a page drawn as
// vector outlines, a stamp-only page) holds its content in the PIXELS only: kept on the layer,
// that page reached the model empty while the document was announced « sent in full ». Such a
// page takes its OCR reading instead — the rule a sparse scan already applies to the whole
// document (`pdfExtract.ts`), decided here page by page.
//
// ONE rule for the final text and the preview stream (`pdfExtract.ts` `startStream`): a stream
// that announced the layer for a page the result then replaced would desynchronise the
// renderer's early masking from the final text it checks against.
import { PDF_MIN_CHARS_PER_PAGE } from "../core";
import { PAGE_BREAK } from "../pageBreak";
import { isUnreadableLayer } from "./readable";

const dense = (s: string): number => s.replace(/\s/g, "").length;

/** May OCR replace this page's layer? Only a THIN or UNREADABLE one — a dense, clean layer is
 *  exact characters, never downgraded to a reading of its pixels. */
export function layerMayYield(layer: string): boolean {
  return dense(layer) < PDF_MIN_CHARS_PER_PAGE || isUnreadableLayer(layer);
}

/** The page's primary text: its OCR reading when the layer may yield AND OCR read more of it,
 *  else the layer. `ocr` absent (the page was not rasterised) keeps the layer. */
export function pagePrimary(layer: string, ocr: string | undefined): string {
  if (ocr === undefined || !layerMayYield(layer)) return layer;
  return dense(ocr) > dense(layer) ? ocr : layer;
}

/**
 * The digital PDF's primary text, page by page: each page's `pagePrimary` over the RAW layer
 * (untrimmed, page-aligned) and each page's OCR reading, indexed BY PAGE (`OcrLayerPage.text`,
 * an empty placeholder for a page not read — `ocr/pdf.ts` — or the texts OCR reported page by
 * page). `promoted`: the 1-based pages that took their OCR reading. Readings that cannot be
 * matched to the layer's pages (more of them than pages) change nothing: the layer stays whole.
 */
export function mergeThinPages(
  rawLayer: string,
  pageReads: readonly (string | undefined)[] | undefined,
): { text: string; promoted: number[] } {
  const layers = rawLayer.split(PAGE_BREAK);
  if (!pageReads?.length || pageReads.length > layers.length) return { text: rawLayer.trim(), promoted: [] };
  const promoted: number[] = [];
  const out = layers.map((layer, i) => {
    const ocr = pageReads[i] || undefined; // "" / absent = a page OCR did not read
    const primary = pagePrimary(layer, ocr);
    if (primary !== layer) promoted.push(i + 1);
    return primary;
  });
  return { text: out.join(PAGE_BREAK).trim(), promoted };
}

/** How many pages of a digital PDF may take their OCR reading — counted BEFORE OCR, so the
 *  masking budget is refused up front, not after minutes of reading (`maskPlan`). */
export function yieldingPages(rawLayer: string, only: readonly number[] | undefined): number {
  const layers = rawLayer.split(PAGE_BREAK);
  const read = only ? new Set(only) : null;
  return layers.filter((l, i) => (!read || read.has(i + 1)) && layerMayYield(l)).length;
}
