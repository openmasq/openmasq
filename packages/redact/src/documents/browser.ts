// Browser binding for the shared extraction core (@openmasq/redact/documents.browser).
// Supplies the SAME parsers as ./node but with in-browser libs (pdf.js, mammoth
// browser build, SheetJS) so the extension extracts files locally — no bytes
// ever leave the machine. pdf.js/mammoth/xlsx are dynamic-`import()`ed (bundled
// by the consumer's Vite). OCR (tesseract) is NOT imported here — it's a heavy,
// asset-hungry lib that MV3 must bundle carefully, so the consumer INJECTS an
// `ocr(bytes)` fn via `configureBrowserExtract`; absent → images/scanned PDFs
// degrade to a graceful error. The consumer also passes the bundled pdf.js
// worker URL (MV3 forbids remote code). Best-effort, mirrors ./node — never throws.
import type { RedactOptions } from "../index";
import {
  extractFromBytes,
  redactExtracted,
  PAGE_BREAK,
  type ExtractDeps,
  type ExtractedFile,
  type RedactedDocument,
} from "./core";
import { DEFAULT_OCR_MARKERS, type OcrMarkers } from "./ocrMarkers";
import { pdfPagesRefusal, rasterScale } from "./safety/guard";
import { reconstructPageText } from "./serialize/pdfLayout";

export { SUPPORTED_EXTENSIONS, OCR_LANGS, OCR_TRAINEDDATA_SHA256, hybridLayerText, spatialFieldLines } from "./core";
// Send-cut → grid-row mapping for the preview grid (same parser/serializer as extraction).
export { delimitedGrid, annotatedCutRow } from "./core";
export type { ExtractedFile, RedactedDocument, TextLayerPage, OcrLayerPage, LayerGeometry, OcrMarkers } from "./core";
// The preview stream of a PDF being read: the renderer assembles the pages as the extractor joins them.
export { pageOffsets, streamedPrefix, STREAM_MAX_PAGES, THUMB_MAX_WIDTH_PX, PAGE_BREAK } from "./core";
export type { ExtractStreamEvent, PageEvent } from "./core";
export type { DocumentErrorCode, DocumentErrorParams } from "./core";

export interface BrowserExtractConfig {
  /** URL of the bundled pdf.js worker (Vite `?url` / chrome.runtime.getURL). */
  pdfWorkerSrc?: string;
  /** OCR one image's bytes → text. Injected by the consumer (e.g. tesseract.js
   *  wired to bundled MV3 assets). Absent → images / scanned PDFs return an error. */
  ocr?: (bytes: Uint8Array) => Promise<string>;
  /** Wording of the skipped-page markers; absent ⇒ `DEFAULT_OCR_MARKERS` (English). */
  ocrMarkers?: OcrMarkers;
}

let cfg: BrowserExtractConfig = {};
let pdfjsMod: any;

/** Wire the local asset URLs + the OCR fn. Call once before extracting. */
export function configureBrowserExtract(c: BrowserExtractConfig): void {
  cfg = { ...cfg, ...c };
  if (pdfjsMod && cfg.pdfWorkerSrc) pdfjsMod.GlobalWorkerOptions.workerSrc = cfg.pdfWorkerSrc;
}

async function pdfjs(): Promise<any> {
  if (!pdfjsMod) {
    pdfjsMod = await import("pdfjs-dist");
    if (cfg.pdfWorkerSrc) pdfjsMod.GlobalWorkerOptions.workerSrc = cfg.pdfWorkerSrc;
  }
  return pdfjsMod;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const out: string[] = [];
  // Past the cap the PDF is REFUSED, never read up to it (`pdfPagesRefusal`).
  const tooMany = pdfPagesRefusal(doc.numPages);
  if (tooMany) {
    await doc.destroy?.();
    throw tooMany;
  }
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // Approach A (geometric): rebuild reading order + columns from item.transform
    // instead of a flat join, so a form's `label : value` pairs stay parseable.
    out.push(reconstructPageText(tc.items));
    page.cleanup?.();
  }
  await doc.destroy?.();
  return out.join(PAGE_BREAK);
}

async function ocrImage(bytes: Uint8Array): Promise<string> {
  if (!cfg.ocr) throw new Error("OCR not configured (tesseract not loaded)");
  return (await cfg.ocr(bytes)).trim();
}

/** Rasterise each page to read to PNG (pdf.js + OffscreenCanvas) then OCR it via `cfg.ocr`.
 *  Every page unless `only` names them (1-based) — never a cap: this binding reports no
 *  `needsOcr`, so the core always passes `undefined` here and the whole document is read.
 *  ⚠️ The 2nd parameter is the progress callback of the `ExtractDeps.ocrPdf` contract. */
async function ocrPdf(
  bytes: Uint8Array,
  onProgress?: (done: number, pages: number) => void,
  only?: readonly number[],
  markers: OcrMarkers = cfg.ocrMarkers ?? DEFAULT_OCR_MARKERS,
): Promise<{ text: string; meta: { engine: string; ms: number; pages: number; pagesTotal: number } }> {
  const t0 = Date.now();
  if (!cfg.ocr) throw new Error("OCR not configured (tesseract not loaded)");
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const total: number = doc.numPages;
  const toRead = only ? new Set(only) : null;
  const pages = toRead ? [...toRead].filter((n) => n >= 1 && n <= total).length : total;
  const tick = (done: number) => {
    try {
      onProgress?.(done, pages);
    } catch {
      /* display only — never interrupts the OCR */
    }
  };
  tick(0);
  const out: string[] = [];
  let done = 0;
  for (let i = 1; i <= total; i++) {
    if (toRead && !toRead.has(i)) {
      out.push("");
      continue;
    }
    const page = await doc.getPage(i);
    // Same ceiling as the Node rasteriser (`../ocr/pdf.ts`, which states it in full): the
    // canvas is sized from geometry the FILE chooses, so a scale fixed at 2 lets an
    // absurd page allocate gigabytes here too — in the tab, this time.
    const base = page.getViewport({ scale: 1 });
    const scale = rasterScale(base.width, base.height, 2);
    if (scale === null) {
      out.push(markers.pageTooLarge(i));
      tick(++done);
      page.cleanup?.();
      continue;
    }
    const viewport = page.getViewport({ scale });
    const canvas: any = new (globalThis as any).OffscreenCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvas.convertToBlob();
    const png = new Uint8Array(await blob.arrayBuffer());
    out.push((await cfg.ocr(png)).trim());
    tick(++done);
    page.cleanup?.();
  }
  await doc.destroy?.();
  // Minimal meta (the browser doesn't have the docTR router).
  return {
    text: out.join(PAGE_BREAK).trim(),
    meta: { engine: "tesseract", ms: Date.now() - t0, pages, pagesTotal: total },
  };
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const mod: any = await import("mammoth");
  const mammoth = mod.default ?? mod;
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return String(value ?? "");
}

const browserDeps: ExtractDeps = { pdfText, docxText, ocrImage, ocrPdf };

/** Extract plain text from in-browser bytes. Best-effort (never throws). */
export async function extractBytesBrowser(
  bytes: Uint8Array,
  name: string,
  mime?: string,
): Promise<ExtractedFile> {
  return extractFromBytes(bytes, { name, mime }, browserDeps);
}

/** Extract + scrub in-browser bytes in one call. */
export async function redactDocumentBytes(
  bytes: Uint8Array,
  name: string,
  mime?: string,
  options: RedactOptions = {},
): Promise<RedactedDocument> {
  return redactExtracted(await extractBytesBrowser(bytes, name, mime), options);
}
