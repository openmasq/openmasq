// The public contract of `pdfRedact.ts` — what a consumer receives per page and what it
// may ask for. Split out so the painter file stays the painter; every name here is
// re-exported from `pdfRedact.ts`, which is the ONE import site (`@openmasq/redact/pdf-redact`).
import type { PdfReplacement, RedactBox } from "./pdfMatch";
import type { OcrWord } from "../ocr/layout";
import type { PageWord } from "./pageWords";
import type { ImageZone } from "./imageZones";

/** One rendered page: a painted canvas + the redacted regions to reveal on hover.
 *  `covered` = every REAL value accounted for by this page's paint (own box, or fully
 *  subsumed under a longer painted value) — the per-VALUE coverage the send gate
 *  (`sendGuards.ts` `paintCoversReplacements`) checks before pages may leave as images. */
export interface RenderedPage {
  canvas: HTMLCanvasElement;
  boxes: RedactBox[];
  /** Re-apply a NEW reveal set INCREMENTALLY: restores the original pixels under
   *  each redaction box then repaints the non-revealed ones — no pdf.js reload,
   *  no full re-render. Returns the boxes with `revealed` recomputed (rebuild the
   *  marks from them). */
  applyReveal: (reveal?: ReadonlySet<string>) => RedactBox[];
  /** Every word's box (CSS px) — the click-to-redact hit-test layer. Empty
   *  unless `collectWords` was requested (it costs a measureText per word). */
  words: PageWord[];
  /** The subset of `words` whose TEXT belongs to the model-facing wire — the halo's
   *  source. On a page with a text layer the image-sourced OCR words (logo, tampon)
   *  are excluded: they are read and framed as `imageZones`, but their text never
   *  leaves as text, so a halo over them would contradict the frame beside it. On an
   *  `imageOnly` page OCR IS the primary text, so every word qualifies. `words` stays
   *  complete on purpose — a stamp must remain clickable to redact its pixels. */
  wireWords: PageWord[];
  /** Regions the page DISPLAYS that its text layer does not contain — a logo, a stamp,
   *  a scanned insert. Not part of the text the model receives, so the consumer can
   *  mark them. Needs the text-layer word geometry: empty unless `collectWords`, and
   *  empty on an `imageOnly` page (there the badge is the honest answer). */
  imageZones: ImageZone[];
  /** The page has OCR words and NO text layer: everything on it is read from pixels. */
  imageOnly: boolean;
  cssW: number;
  cssH: number;
  covered: ReadonlySet<string>;
}

export interface RenderRedactedPdfOptions {
  bytes: Uint8Array;
  /** Bundled pdf.js worker URL (Vite `?url` / chrome.runtime.getURL). */
  pdfWorkerSrc: string;
  /** false → render the ORIGINAL document as-is (no fakes, no highlights). */
  redacted?: boolean;
  /** Pre-computed real→fake map (from attach). When set, no derivation here. */
  replacements?: PdfReplacement[];
  /** Derive replacements from the doc's own text when `replacements` is absent. */
  getReplacements?: (
    fullText: string,
  ) => Promise<{ replacements: PdfReplacement[]; modelError?: string }>;
  /**
   * REAL values the user explicitly chose to KEEP IN CLEAR (before-send preview
   * click-to-un-redact). A replacement whose `real` is in this set is NOT painted
   * — the original glyphs stay visible — and its box is returned with
   * `revealed:true` so the consumer can offer "re-redact". Privacy: a value
   * leaves redaction ONLY when present here. Omit / empty ⇒ everything redacted.
   */
  reveal?: ReadonlySet<string>;
  /**
   * Per-page OCR WORD GEOMETRY from the extraction (`ExtractedFile.ocrPages`,
   * parallel to the document's pages): the SCANNED-page fallback. A scan has no
   * pdf.js text items, so without this the render shows the raw pixels with ZERO
   * redaction boxes even though OCR succeeded and the values are vaulted. When a
   * page's text layer leaves values uncovered and its OCR geometry is present, the
   * painter correlates those values on the OCR words and paints their boxes
   * (scaled raster→canvas). Optional — absent geometry degrades to text-layer-only
   * (and the ship gate then refuses the pixels, fail-closed as before).
   */
  ocrPages?: ({ words: OcrWord[]; width: number; height: number } | undefined)[];
  /** Also collect every page's WORD boxes (`RenderedPage.words`) — the consumer's
   *  click-to-redact hit-test. Off by default (a measureText per word). */
  collectWords?: boolean;
  maxPages?: number;
  signal?: AbortSignal;
  /**
   * Progress callback for a long redaction. Fires ONCE up-front with the page
   * count (`phase:"detect"`, `page:0`) when a model detection precedes the render
   * — so the UI can show "N pages à redact" immediately — then once per page
   * as it is painted (`phase:"render"`, `page` = 1..total). Pure notification; it
   * never affects the result and is safe to omit.
   */
  onProgress?: (p: { phase: "detect" | "render"; page: number; total: number }) => void;
}

export interface RenderRedactedPdfResult {
  pages: RenderedPage[];
  modelError?: string;
  truncated: number;
}

