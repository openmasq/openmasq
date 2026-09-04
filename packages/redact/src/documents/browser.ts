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
import { MAX_PDF_PAGES, rasterScale } from "./guard";
import { reconstructPageText } from "./pdfLayout";

export { SUPPORTED_EXTENSIONS, OCR_LANGS, OCR_TRAINEDDATA_SHA256, hybridLayerText, spatialFieldLines } from "./core";
// Send-cut → grid-row mapping for the preview grid (same parser/serializer as extraction).
export { delimitedGrid, annotatedCutRow } from "./core";
export type { ExtractedFile, RedactedDocument, TextLayerPage, OcrLayerPage, LayerGeometry } from "./core";

export interface BrowserExtractConfig {
  /** URL of the bundled pdf.js worker (Vite `?url` / chrome.runtime.getURL). */
  pdfWorkerSrc?: string;
  /** OCR one image's bytes → text. Injected by the consumer (e.g. tesseract.js
   *  wired to bundled MV3 assets). Absent → images / scanned PDFs return an error. */
  ocr?: (bytes: Uint8Array) => Promise<string>;
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
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES); // cap: a huge page count can't hang extraction
  for (let i = 1; i <= pages; i++) {
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
  if (!cfg.ocr) throw new Error("OCR non configuré (tesseract non chargé)");
  return (await cfg.ocr(bytes)).trim();
}

/** Rasterise each page to PNG (pdf.js + OffscreenCanvas) then OCR it via `cfg.ocr`.
 *  ⚠️ The 2nd parameter is the progress callback of the `ExtractDeps.ocrPdf` contract —
 *  a positional `maxPages` here would receive the FUNCTION (Math.min(n, fn) = NaN, loop
 *  skipped, OCR silently empty). */
const OCR_PDF_MAX_PAGES = 10;
async function ocrPdf(
  bytes: Uint8Array,
  onProgress?: (done: number, pages: number) => void,
  maxPages: number = OCR_PDF_MAX_PAGES,
): Promise<{ text: string; meta: { engine: string; ms: number; pages: number; pagesTotal: number } }> {
  const t0 = Date.now();
  if (!cfg.ocr) throw new Error("OCR non configuré (tesseract non chargé)");
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pages = Math.min(doc.numPages, maxPages);
  const tick = (done: number) => {
    try {
      onProgress?.(done, pages);
    } catch {
      /* display only — never interrupts the OCR */
    }
  };
  tick(0);
  const out: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    // Same ceiling as the Node rasteriser (`../ocr/pdf.ts`, which states it in full): the
    // canvas is sized from geometry the FILE chooses, so a scale fixed at 2 lets an
    // absurd page allocate gigabytes here too — in the tab, this time.
    const base = page.getViewport({ scale: 1 });
    const scale = rasterScale(base.width, base.height, 2);
    if (scale === null) {
      out.push(`[… page ${i} non océrisée : dimensions excessives]`);
      tick(i);
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
    tick(i);
    page.cleanup?.();
  }
  await doc.destroy?.();
  if (doc.numPages > pages) {
    out.push(`[… ${doc.numPages - pages} page(s) supplémentaire(s) non océrisée(s)]`);
  }
  // Minimal meta (the browser doesn't have the docTR router): just enough for the
  // chip to say « N/M pages read » here too.
  return {
    text: out.join(PAGE_BREAK).trim(),
    meta: { engine: "tesseract", ms: Date.now() - t0, pages, pagesTotal: doc.numPages },
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
