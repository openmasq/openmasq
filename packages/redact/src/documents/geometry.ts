// Per-page GEOMETRY of the two extraction layers — the raw material of the cross-layer
// spatial alignment (reconcile.ts). Both layers already produce positions (pdf.js item
// transforms; OCR word boxes); these shapes carry them all the way to `ExtractedFile`
// instead of dropping them at extraction time.
//
// Two coordinate spaces, ONE bridge:
//   • text layer — PDF points, origin BOTTOM-left, `x/y` = item baseline. `width`/`height`
//     is the scale-1 viewport, so `rasterWidth / width` is the exact scale to the OCR
//     raster of the SAME page (plus the y-flip: y_px = (height − y_pt) · scale).
//   • OCR layer — raster pixels, origin TOP-left (the canonical `OcrWord` space).
// Pure (no pdf.js/DOM): callers hand in already-parsed items.
import { reconstructLayout, type LayoutRun, type PdfTextItem } from "./pdfLayout";
import type { OcrWord } from "../ocr/layout";

/** Axis-aligned box of one text-layer item (PDF points, bottom-left origin, baseline y).
 *  For a ROTATED item this is the baseline-anchored approximation (w along the reading
 *  direction) — good enough to locate it; alignment treats it as a locator, not a paint box. */
export interface GlyphBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One PDF page of the TEXT layer, with its geometry. */
export interface TextLayerPage {
  /** The page's reconstructed reading-order text (offsets are page-LOCAL). */
  text: string;
  /** Char run in `text` → index into `boxes` (same indexing as the pdf.js items array). */
  runs: LayoutRun[];
  /** Per-item boxes, PARALLEL to the original pdf.js items array (`runs[i].itemIndex`). */
  boxes: GlyphBox[];
  /** Page size in PDF points (scale-1 viewport) — the bridge to the OCR raster. */
  width: number;
  height: number;
}

/** One PDF page of the OCR layer: what the pixels say, with the word boxes. */
export interface OcrLayerPage {
  /** The page's layout-aware OCR text (offsets are page-LOCAL). */
  text: string;
  /** Positioned words (raster pixels, top-left origin). */
  words: OcrWord[];
  /** Raster dimensions the boxes are relative to. */
  width: number;
  height: number;
}

/** Build one page's `TextLayerPage` from its pdf.js items + scale-1 viewport size.
 *  Reuses `reconstructLayout` (same text as `reconstructPageText` — one computation,
 *  not two) and derives each item's box with the same size fallbacks. */
export function buildTextLayerPage(
  items: PdfTextItem[],
  width: number,
  height: number,
): TextLayerPage {
  const { text, runs } = reconstructLayout(items);
  const boxes: GlyphBox[] = items.map((it) => {
    const t = it.transform ?? [1, 0, 0, 1, 0, 0];
    // Font size lives in t[3] for horizontal text but in t[1] once rotated 90°/270°.
    const h = it.height || Math.abs(t[3]) || Math.abs(t[1]) || 10;
    const w = it.width || (it.str ?? "").length * h * 0.5;
    return { x: t[4], y: t[5], w, h };
  });
  return { text, runs, boxes, width, height };
}
