// Shared document-extraction CORE — pure, no Node/DOM libs.
//
// Owns the format dispatch + the `ExtractedFile` shape + the redact-a-document
// flow. The platform-divergent parsers (PDF text layer, DOCX, OCR) are injected
// as `ExtractDeps` by the Node entry (./node) and the browser entry (./browser),
// so NOTHING is duplicated across platforms. Plain text (TextDecoder) and
// spreadsheets (SheetJS is isomorphic) are handled here directly; CSV/TSV/XLSX go
// through `./tabular` HEADER-ANNOTATED serialization (approach A) for detection.
import { delimitedGrid, gridToAnnotatedText } from "./tabular";
import { cleanErr, msg, OCR_FAILED, IMAGE_OCR_FAILED } from "./errors";
import { guardUpload } from "./guard";
import { isUnreadableLayer } from "./readable";
import type { OcrWord } from "../ocr/layout";
import type { TextLayerPage, OcrLayerPage } from "./geometry";
import {
  TEXT_EXT, SHEET_EXT, IMAGE_EXT, MIME_EXT,
  baseName, extOf, sheetText, pptxText,
} from "./formats";

// Split-out pieces re-exported so every existing import path keeps resolving.
export { SUPPORTED_EXTENSIONS, MIME_EXT, baseName, extOf } from "./formats";
export { OCR_LANGS, OCR_TRAINEDDATA_SHA256 } from "./ocrPins";
export { redactExtracted, hybridLayerText, type RedactedDocument, type LayerGeometry } from "./reconcile";
export { spatialFieldLines } from "./spatialFields";
// Send-cut → grid-row mapping (tabular.ts) — re-exported so the UI can't grow a drifting copy.
export { delimitedGrid, annotatedCutRow } from "./tabular";
export type { TextLayerPage, OcrLayerPage, GlyphBox } from "./geometry";

export interface ExtractedFile {
  name: string;
  kind: string; // "text" | "csv" | "xlsx" | "docx" | "pdf" | "image" | …
  text: string;
  chars: number;
  error?: string;
  /** The RAW cause behind a generic `error` (`cleanErr` used to hide it in console
   *  only — unrecoverable for a user, 13/08 audit). NEVER rendered in the UI
   *  (`cleanErr`'s allow-list remains the display rule); consumed by the debug
   *  log (`ocrDebug.ts`), which lives in the renderer and can hold it. */
  rawCause?: string;
  /** Set when the SAFETY guard REFUSED the file (oversize / type-mismatch / bomb)
   *  — a deliberate rejection, not a parse failure. The UI shows it distinctly and
   *  offers no "retry" (re-running the guard would refuse it again). */
  blocked?: boolean;
  /** Source path on disk — set by the caller so the original can be stored. */
  path?: string;
  /** MIME type (best-effort). */
  mime?: string;
  /** For an OCR'd IMAGE (scan): the recognised words with their ORIGINAL pixel
   *  boxes, so the renderer can paint the redaction on the image (see
   *  `imageRedact.renderRedactedImage`). Absent when OCR gave no geometry. */
  words?: OcrWord[];
  /** THE SECOND LAYER. A PDF is ALWAYS OCR'd (not only when its text layer is thin):
   *  content baked into page IMAGES — a stamp, a signature, a scanned insert, a form
   *  field — is INVISIBLE to the pdf.js text layer, so PII there would slip through
   *  un-redacted. `text` is the primary layer (the exact text layer, model-facing; or the
   *  OCR result for a true scan), and `ocrText` is what the PIXELS actually say. When they
   *  differ, BOTH are surfaced: the union drives detection (`redactExtracted`) so nothing
   *  in either layer escapes, and the UI shows both so a discrepancy (hidden/altered text,
   *  OCR-only PII) is visible. Absent when the OCR layer adds nothing over `text`. */
  ocrText?: string;
  /** How the text was EXTRACTED + how long, surfaced to the renderer's Debug Log
   *  (Développeur → Journal de débogage): the OCR engine for an image / scanned PDF, or
   *  `"pdf-text"` for a PDF read via its text layer (pdf.js, no OCR). Absent for a
   *  non-PDF/non-image format (docx/xlsx/txt parse trivially). */
  ocr?: OcrMeta;
  /** Per-page GEOMETRY of the text layer (glyph boxes + char-run map + page size in PDF
   *  points) — the text-layer half of the cross-layer spatial alignment. Present only
   *  when the text layer IS the primary `text` (a digital PDF via the positional
   *  extractor); absent on the flat fallback, a scan, or a binding without geometry. */
  textPages?: TextLayerPage[];
  /** Per-page GEOMETRY of the OCR layer (word boxes + raster size) — the OCR half of
   *  the alignment. Present whenever the OCR pass reported it. */
  ocrPages?: OcrLayerPage[];
}

/** Text-extraction metadata for the Debug Log — which engine/method ran, and how long. */
export interface OcrMeta {
  /** The method/engine whose output was USED: `"doctr"` (docTR/Mindee, latin), `"tesseract"`,
   *  `"doctr+tesseract"` (mixed PDF pages), or `"pdf-text"` (pdf.js text layer, no OCR). */
  engine: string;
  /** Wall-clock of the whole OCR call, ms (includes a docTR→Tesseract fallback if it happened). */
  ms: number;
  /** Pages OCR'd (scanned PDF); absent for a single image. */
  pages?: number;
  /** The TOTAL number of pages in the document — when it exceeds `pages`, the read was
   *  partial (default cap) and the UI must say so, not only the text. */
  pagesTotal?: number;
  /** docTR only: mean CTC confidence 0–1 of the recognised text (the routing signal). */
  confidence?: number;
  /** True when docTR ran but the router FELL BACK to Tesseract (non-latin / low confidence). */
  fellBack?: boolean;
}

// A PDF whose text-layer is shorter than this is treated as scanned → OCR.
export const PDF_TEXT_MIN = 16;
// …AND a PDF whose text layer is TOO SPARSE per page is a scan too: a scanned form/RIB
// often carries a THIN layer (header/footer, page number) clearing `PDF_TEXT_MIN` while the
// real content sits in the image — OCR was skipped and nothing was redacted. A digital page
// has HUNDREDS of chars; a scan's layer has almost none.
export const PDF_MIN_CHARS_PER_PAGE = 120;

// Marker inserted between the pages of a multi-page document (PDF text / OCR) so page
// boundaries survive into `text` and the viewer can render each page as its OWN sheet.
// `\f` is pure whitespace to the model, to search and to the (value-based) engine, so it
// changes nothing downstream except that the UI can now split on it; wrapped in newlines
// so the flat text still reads with a page separation.
export const PAGE_BREAK = "\n\f\n";

/** The parsers each platform must supply (the ones that diverge Node↔browser). */
export interface ExtractDeps {
  /** PDF text layer only (no OCR). Node returns `{text, pages, imagePages}` — `pages` is the
   *  density denominator and `imagePages` counts SPARSE pages carrying a paint-image op (a
   *  SCAN → route to OCR; a short DIGITAL page has none → keep the text). The browser binding
   *  may return a bare string (⇒ pages=1, imagePages=0, so only an EMPTY layer routes to OCR).
   *  `layout` (optional): the per-page text-layer geometry, absent on the flat fallback. */
  pdfText(bytes: Uint8Array): Promise<
    string | { text: string; pages?: number; imagePages?: number; layout?: TextLayerPage[] }
  >;
  /** DOCX raw paragraph text. */
  docxText(bytes: Uint8Array): Promise<string>;
  /** OCR an image. */
  ocrImage(bytes: Uint8Array): Promise<string>;
  /** OCR a scanned PDF (rasterise + OCR each page). Node returns `{text, meta, layout}`
   *  (engine + timing for the Debug Log; per-page word boxes + raster dims for the
   *  cross-layer alignment); the browser binding returns a bare string. `onProgress`
   *  (optional, advisory) fires per OCR'd page — a binding may ignore it. */
  ocrPdf(
    bytes: Uint8Array,
    onProgress?: (done: number, pages: number) => void,
    /** Page cap (`Infinity` = "Read all"; absent ⇒ binding default, 10).
     *  ⚠️ 3rd position — the 2nd is the callback (function in `Math.min` = NaN). */
    maxPages?: number,
  ): Promise<string | { text: string; meta?: OcrMeta; layout?: OcrLayerPage[] }>;
  /** OCR an image KEEPING the positioned words, so the caller can paint the
   *  redaction on the image. Optional — when absent, `ocrImage` (text only) is used.
   *  `meta` (the engine + timing) is optional so a binding without the router can omit it. */
  ocrImageLayout?(bytes: Uint8Array): Promise<{
    text: string;
    words: OcrWord[];
    meta?: OcrMeta;
    /** Raster dims (docTR exact, Tesseract approximated by box extent) — what lets an
     *  IMAGE grow an `ocrPages` entry, so spatial reasoning works on photos too. */
    width?: number;
    height?: number;
  }>;
}

/**
 * Extract plain text from in-memory bytes, dispatching by format to `deps`.
 * Best-effort: an unreadable/unsupported file returns `{ error }` + empty text
 * rather than throwing, so one bad attachment never breaks a send.
 */
export async function extractFromBytes(
  bytes: Uint8Array,
  opts: {
    name: string;
    mime?: string;
    /** OCR progress (display only): loops per page of a scanned PDF;
     *  0/1 → 1/1 around an image's OCR; nothing for a format without OCR. */
    onOcrProgress?: (done: number, pages: number) => void;
    /** "Read all": lift the OCR cap (default 10) — opt-in by user GESTURE. */
    ocrAllPages?: boolean;
  },
  deps: ExtractDeps,
): Promise<ExtractedFile> {
  const name = baseName(opts.name) || "file";
  const mime = opts.mime;
  let ext = extOf(opts.name);
  if (!ext && mime) ext = MIME_EXT[mime.split(";")[0].trim().toLowerCase()] ?? "";
  // SAFETY GATE — reject an oversized / type-mismatched / bomb file BEFORE it
  // reaches a heavy parser (pdf.js / mammoth / SheetJS). Best-effort contract is
  // preserved: a rejection is a `{ error }` result with empty text, never a throw.
  const unsafe = guardUpload(bytes, ext);
  if (unsafe) return { name, kind: ext.slice(1) || "file", text: "", chars: 0, mime, error: unsafe, blocked: true };
  try {
    if (ext === ".pdf") {
      const tText = Date.now();
      const raw = await deps.pdfText(bytes);
      let text = (typeof raw === "string" ? raw : raw.text).trim();
      const pages = Math.max(1, typeof raw === "string" ? 1 : (raw.pages ?? 1));
      const imagePages = typeof raw === "string" ? 0 : (raw.imagePages ?? 0);
      // Text-layer geometry: kept only while the text layer IS the primary `text` (an
      // OCR promotion below invalidates the page↔text mapping, so it is dropped then).
      let textPages = typeof raw === "string" ? undefined : raw.layout;
      let ocrPages: OcrLayerPage[] | undefined;
      const layerMs = Date.now() - tText;
      // ⚠️ Unreadable == ABSENT, otherwise OCR is never attempted where it should be (`readable.ts`).
      const noLayer = text.length < PDF_TEXT_MIN || isUnreadableLayer(text);
      // A true SCAN whose thin text layer must be REPLACED by OCR (a header/footer over an
      // image-based form/RIB): empty layer, OR too SPARSE per page while those pages carry a
      // paint-image op. The image check separates a scan from a short-but-correct digital page.
      const sparseScan = text.length < pages * PDF_MIN_CHARS_PER_PAGE && imagePages > 0;

      // ALWAYS OCR (blocking) — a privacy product must never trust the text layer to be
      // COMPLETE. Text baked into page images is invisible to pdf.js, so OCR runs on EVERY
      // PDF and we keep BOTH layers. OCR is used two ways: it PROMOTES to the primary `text`
      // for a scan (no/thin layer), and otherwise it is exposed as the additive `ocrText`
      // second layer feeding the union detection + the two-layer UI.
      let ocrText: string | undefined;
      let ocr: OcrMeta | undefined = { engine: "pdf-text", ms: layerMs };
      try {
        const res = await deps.ocrPdf(
          bytes,
          opts.onOcrProgress,
          opts.ocrAllPages ? Infinity : undefined,
        );
        const ocrRaw = (typeof res === "string" ? res : res.text).trim();
        const ocrMeta = typeof res === "string" ? undefined : res.meta;
        ocrPages = typeof res === "string" ? undefined : res.layout;
        if (ocrRaw) {
          // Promote OCR to the PRIMARY text only for a scan (no/thin layer, or a sparse-scan
          // where OCR recovered more) — never DOWNGRADE a genuine, richer digital layer.
          if (noLayer || (sparseScan && ocrRaw.length > text.length)) {
            text = ocrRaw;
            textPages = undefined; // the text layer no longer describes `text`
            ocr = ocrMeta ?? { engine: "ocr", ms: Date.now() - tText };
          } else {
            // Digital PDF: OCR is the SECOND layer, additive. Surface it when it says
            // something the text layer doesn't (else it's redundant noise).
            if (ocrRaw !== text) ocrText = ocrRaw;
            ocr = {
              engine: `pdf-text+${ocrMeta?.engine ?? "ocr"}`,
              ms: layerMs + (ocrMeta?.ms ?? 0),
              pages: ocrMeta?.pages,
              confidence: ocrMeta?.confidence,
              fellBack: ocrMeta?.fellBack,
            };
          }
        }
      } catch (e) {
        // Fail-closed on a SCAN (no usable layer + OCR failed) → surface the error. On a
        // digital PDF the OCR layer is additive, so its failure must NOT break extraction
        // (we still have the exact text layer); we just get no second layer.
        if (noLayer) {
          const c = cleanErr(e, OCR_FAILED); // the fallback STATES the fact, it does not diagnose — `errors.ts`
          return {
            name, kind: "pdf", text, chars: text.length, mime,
            error: `PDF sans couche texte — ${c.message}`, rawCause: c.raw,
          };
        }
      }
      return { name, kind: "pdf", text, chars: text.length, mime, ocrText, ocr, textPages, ocrPages };
    }
    if (IMAGE_EXT.has(ext)) {
      try {
        // An image = ONE OCR pass: the 0/1 → 1/1 frame gives a determined state.
        opts.onOcrProgress?.(0, 1);
        // Prefer the positioned OCR (keeps word boxes → visual redaction on the
        // scan); fall back to text-only OCR when the binding doesn't provide it.
        if (deps.ocrImageLayout) {
          const { text: raw, words, meta, width, height } = await deps.ocrImageLayout(bytes);
          const text = raw.trim();
          opts.onOcrProgress?.(1, 1);
          // A photo/scan gets a REAL `ocrPages` entry when the binding reports dims —
          // without it, `spatialFields` and the hybrid layer silently skipped exactly
          // the medium that needs them most (a JPEG of a form has no text layer).
          const ocrPages =
            width && height && words.length ? [{ text, words, width, height }] : undefined;
          return { name, kind: "image", text, chars: text.length, mime, words, ocr: meta, ocrPages };
        }
        const text = (await deps.ocrImage(bytes)).trim();
        opts.onOcrProgress?.(1, 1);
        return { name, kind: "image", text, chars: text.length, mime };
      } catch (e) {
        const c = cleanErr(e, IMAGE_OCR_FAILED);
        return { name, kind: "image", text: "", chars: 0, mime, error: c.message, rawCause: c.raw };
      }
    }
    if (SHEET_EXT.has(ext)) {
      const text = await sheetText(bytes);
      return { name, kind: "xlsx", text, chars: text.length, mime };
    }
    if (ext === ".docx") {
      const text = (await deps.docxText(bytes)).trim();
      return { name, kind: "docx", text, chars: text.length, mime };
    }
    if (ext === ".pptx") {
      const text = (await pptxText(bytes)).trim();
      return { name, kind: "pptx", text, chars: text.length, mime };
    }
    if (TEXT_EXT.has(ext) || ext === "") {
      const raw = new TextDecoder("utf-8").decode(bytes);
      // CSV/TSV: parse the grid and re-emit header-annotated records (approach A) so the
      // detector sees each value beside its column label; raw text if no usable header.
      // ⚠️ The separator is GUESSED — `sniffDelimiter` says what assuming it costs.
      if (ext === ".csv" || ext === ".tsv") {
        const grid = delimitedGrid(raw, ext === ".tsv");
        const text = gridToAnnotatedText(grid) || raw;
        return { name, kind: "csv", text, chars: text.length, mime };
      }
      return { name, kind: "text", text: raw, chars: raw.length, mime };
    }
    return {
      name, kind: ext.slice(1) || "file", text: "", chars: 0, mime,
      error: `Unsupported file type: ${ext || "(none)"}`,
    };
  } catch (e) {
    return { name, kind: "file", text: "", chars: 0, mime, error: msg(e) };
  }
}
