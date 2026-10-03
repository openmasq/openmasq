// Node binding for the shared extraction core (@openmasq/redact/documents).
// Supplies the platform parsers (pdf.js / mammoth / OCR) and re-exports the
// SAME public API the desktop already uses: extractText / extractBytes /
// redactDocument. Heavy libs stay lazy `import()`ed so they never load unless a
// matching file is actually extracted, and never reach the renderer bundle.
import { open } from "node:fs/promises";
import { ocrImage, ocrImageLayout, ocrPdf } from "../ocr";
// Not through the `../ocr` barrel: the thumbnails are preview-only, and the suites that mock
// the OCR engines must not have to stub them.
import { pdfThumbnails } from "../ocr/pdfThumbs";
import type { RedactOptions } from "../index";
import {
  baseName,
  extractFromBytes,
  redactExtracted,
  PDF_MIN_CHARS_PER_PAGE,
  PAGE_BREAK,
  type ExtractDeps,
  type ExtractedFile,
  type ExtractStream,
  type OcrMarkers,
  type RedactedDocument,
} from "./core";
import { fileTooLargeRefusal, MAX_FILE_BYTES, pdfPagesRefusal } from "./safety/guard";
import { DocumentError } from "./errors";
import { reconstructPageText } from "./serialize/pdfLayout";
import { buildTextLayerPage, type TextLayerPage } from "./layers/geometry";
import { pageNeedsOcr } from "./layers/ocrSkip";

export { SUPPORTED_EXTENSIONS, OCR_LANGS, OCR_TRAINEDDATA_SHA256, hybridLayerText, spatialFieldLines, DEFAULT_OCR_MARKERS } from "./core";
export type { ExtractedFile, RedactedDocument, TextLayerPage, OcrLayerPage, LayerGeometry, OcrMarkers } from "./core";
export {
  isSafeThumbnail, pngSize, streamedPrefix, thumbScale, THUMB_MAX_BYTES, THUMB_MAX_HEIGHT_PX, THUMB_MAX_WIDTH_PX,
  STREAM_MAX_PAGES, STREAM_PAGE_MAX_CHARS,
} from "./core";
export type { ExtractStream, ExtractStreamEvent, PageEvent, ThumbEvent } from "./core";
export type { DocumentErrorCode, DocumentErrorParams } from "./core";

/** pdfjs v4 uses Promise.withResolvers (Node 22+); polyfill for Node 20. */
function ensureWithResolvers(): void {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers === "function") return;
  (P as any).withResolvers = <T>() => {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/**
 * Load a pdf.js document from `bytes` and map each page's text items through `render`.
 * Shared by the positional extractor and the flat fallback. pdf.js takes OWNERSHIP of the
 * `data` array and DETACHES its ArrayBuffer (byteLength→0); the caller reuses the SAME
 * original bytes for the OCR pass, so we always hand pdf.js a throwaway COPY (`bytes.slice()`).
 * Throws on a pdf.js failure (or if `render` throws) so the caller can fall back / route to OCR.
 */
async function pdfPages(
  bytes: Uint8Array,
  render: (items: unknown[]) => string,
  withLayout = false,
): Promise<{ text: string; pages: number; imagePages: number; layout?: TextLayerPage[]; needsOcr: number[] }> {
  ensureWithResolvers();
  // pdf.js touches a few DOM globals in Node — borrow them from @napi-rs/canvas
  // (already a dep for OCR). Optional: text extraction may work without them.
  try {
    const canvasMod: any = await import("@napi-rs/canvas");
    for (const k of ["DOMMatrix", "Path2D", "ImageData"]) {
      if (!(k in globalThis) && canvasMod[k]) (globalThis as any)[k] = canvasMod[k];
    }
  } catch {
    /* canvas unavailable — try pdf.js anyway; the caller's catch handles a throw */
  }
  // @ts-ignore — legacy build subpath ships no bundled types
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const getDocument = pdfjs.getDocument ?? pdfjs.default?.getDocument;
  // Image-paint operator ids — used to tell a SCANNED page (a full-page image + a thin/no
  // text layer) from a genuinely SHORT DIGITAL page (little text, no image). Only the former
  // must route to OCR; length alone can't distinguish them.
  const OPS = pdfjs.OPS ?? pdfjs.default?.OPS ?? {};
  const IMG_OPS = new Set(
    [OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintImageMaskXObject, OPS.paintInlineImageXObject].filter(
      (v: unknown) => typeof v === "number",
    ),
  );
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: true, isEvalSupported: false }).promise;
  const out: string[] = [];
  const total = doc.numPages;
  // Past the cap the PDF is REFUSED, never read up to it (`pdfPagesRefusal`).
  const tooMany = pdfPagesRefusal(total);
  if (tooMany) {
    await doc.destroy?.();
    throw tooMany;
  }
  let imagePages = 0;
  // The pages OCR must read: every page whose text layer cannot PROVE it holds all the page
  // shows (`layers/ocrSkip.ts`, an allow-list; any unknown fact counts as « read it »).
  const needsOcr: number[] = [];
  // Per-page text-layer geometry (glyph boxes + char-run map + scale-1 page size), the
  // text-layer half of the cross-layer alignment. Built by `buildTextLayerPage`, whose
  // text IS the positional render — one reconstruction, reused as the page text.
  const layout: TextLayerPage[] | undefined = withLayout ? [] : undefined;
  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let pageText: string;
      if (layout) {
        const vp = page.getViewport({ scale: 1 });
        const lp = buildTextLayerPage(tc.items as never, vp.width, vp.height);
        layout.push(lp);
        pageText = lp.text;
      } else {
        pageText = render(tc.items);
      }
      out.push(pageText);
      // Every page's operator list is read: an image anywhere on a page (a stamp, a scanned
      // insert) is content the text layer does not carry. `null` = could not tell.
      let paintsImage: boolean | null = null;
      if (IMG_OPS.size) {
        try {
          const opl = await page.getOperatorList();
          paintsImage = (opl.fnArray as number[]).some((fn) => IMG_OPS.has(fn));
        } catch {
          /* operator list unavailable — unknown, so the page is OCR'd */
        }
      }
      // A SPARSE page that paints an image is a scan suspect (`core.ts` `sparseScan`).
      if (paintsImage && pageText.replace(/\s/g, "").length < PDF_MIN_CHARS_PER_PAGE) imagePages++;
      let annotations: string[] | null = null;
      try {
        annotations = ((await page.getAnnotations()) as { subtype?: unknown }[]).map((a) => String(a.subtype));
      } catch {
        /* annotations unavailable — unknown, so the page is OCR'd */
      }
      if (pageNeedsOcr({ text: pageText, paintsImage, annotations })) needsOcr.push(i);
      page.cleanup?.();
    }
  } finally {
    await doc.destroy?.();
  }
  // Return the RENDERED page count (denominator for the density check) + how many sparse
  // pages carry an image (a scan → route to OCR; a short digital page has none → keep text).
  return { text: out.join(PAGE_BREAK), pages: total, imagePages, layout, needsOcr };
}

/**
 * PDF text via pdf.js WITH positions → approach A (geometric): rebuild reading order +
 * columns from `item.transform`, so a form's `label : value` pairs stay parseable for the
 * detector. Also carries the per-page geometry out (`layout`), for the cross-layer
 * alignment. Throws on failure so the caller can fall back. "" for a text-less (scanned) PDF.
 */
const pdfjsText = (bytes: Uint8Array): ReturnType<typeof pdfPages> =>
  pdfPages(bytes, (items) => reconstructPageText(items as never), true);

/**
 * FLAT-text fallback — a FIRST-PARTY reimplementation of what `pdf-parse` did, on the
 * pdfjs-dist we ALREADY ship, so the unmaintained external `pdf-parse@1.1.1` (a supply-chain
 * surface) is gone (security audit 2026-07). It skips the geometric reconstruction and just
 * concatenates the raw text items (a `\n` after an end-of-line item), so it still yields text
 * when the positional reconstruction (`reconstructPageText`) throws on an odd item stream. If
 * pdf.js itself can't parse the file, this throws too → the caller routes to OCR.
 */
const pdfFlatText = (bytes: Uint8Array): ReturnType<typeof pdfPages> =>
  pdfPages(bytes, (items) =>
    (items as { str?: string; hasEOL?: boolean }[])
      .map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " "))
      .join("")
      .trim(),
  );

const nodeDeps: ExtractDeps = {
  pdfText: async (bytes) => {
    try {
      // Structured extraction first (positions → reading order + columns).
      return await pdfjsText(bytes);
    } catch (e) {
      // A deliberate refusal (too many pages) is the answer, not a parse failure: it must
      // not fall through to the flat reader, nor to OCR on a « text-less » PDF.
      if (e instanceof DocumentError) throw e;
      // The geometric reconstruction failed on an odd item stream → FLAT first-party
      // extraction on the SAME pdf.js (no external `pdf-parse`). If pdf.js itself can't
      // parse the file, this throws too → return "" so `core.ts` routes the file to OCR
      // (rasterise + read), the universal fallback for scanned / text-broken PDFs.
      try {
        return await pdfFlatText(bytes);
      } catch (e2) {
        if (e2 instanceof DocumentError) throw e2;
        return { text: "", pages: 0, imagePages: 0 };
      }
    }
  },
  docxText: async (bytes) => {
    const mod: any = await import("mammoth");
    const mammoth = mod.default ?? mod;
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return String(value ?? "");
  },
  ocrImage: (bytes) => ocrImage(bytes),
  ocrImageLayout: (bytes) => ocrImageLayout(bytes),
  // `undefined` for lang: `ocrPdf`'s default applies; the pages to read, the progress
  // callback and the markers' wording are threaded.
  ocrPdf: (bytes, onProgress, pages, markers, onPage) => ocrPdf(bytes, undefined, pages, onProgress, markers, onPage),
  pdfThumbnails,
};

/** Extract plain text from a file on disk. Best-effort (never throws). */
export async function extractText(
  filePath: string,
  onOcrProgress?: (done: number, pages: number) => void,
  /** Wording of the skipped-page markers OCR writes into the text (the user's language). */
  ocrMarkers?: OcrMarkers,
  /** A PDF's pages and thumbnails as they are read — preview only (`pageStream.ts`). */
  stream?: ExtractStream,
): Promise<ExtractedFile> {
  const name = baseName(filePath);
  try {
    // The size gate runs on the open handle's STAT, before a byte is read: the byte gate
    // inside `extractFromBytes` would only refuse a file already loaded whole into memory.
    // Stat and read go through ONE handle, so the file checked is the file read.
    const fh = await open(filePath, "r");
    let bytes: Uint8Array;
    try {
      if ((await fh.stat()).size > MAX_FILE_BYTES) {
        const { message: error, code: errorCode, params: errorParams } = fileTooLargeRefusal();
        return { name, kind: "file", text: "", chars: 0, error, errorCode, errorParams, blocked: true };
      }
      bytes = new Uint8Array(await fh.readFile());
    } finally {
      await fh.close();
    }
    return await extractFromBytes(bytes, { name, onOcrProgress, ocrMarkers, stream }, nodeDeps);
  } catch (e) {
    return { name, kind: "file", text: "", chars: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A PLAIN Uint8Array copy of possibly-Buffer bytes. Two pdf.js contracts make this
 * mandatory at the Node entry: pdf.js v4 REJECTS a Node `Buffer` outright ("Please
 * provide binary data as `Uint8Array`, rather than `Buffer`"), and `Buffer.slice()`
 * is a VIEW (not the copy `Uint8Array.slice()` is), so the detach-guard copies made
 * downstream (`bytes.slice()` before every `getDocument`) would silently share — and
 * lose — the caller's ArrayBuffer. A Buffer-fed extraction failed BOTH layers and
 * surfaced as "PDF sans couche texte", i.e. an empty « Texte extrait » on every PDF
 * reached via the bytes IPC. Non-Buffer input passes through untouched.
 */
export function asUint8(bytes: Uint8Array): Uint8Array {
  return typeof Buffer !== "undefined" && Buffer.isBuffer(bytes) ? new Uint8Array(bytes) : bytes;
}

/** Extract text from in-memory bytes (e.g. a file returned by an MCP tool). */
export async function extractBytes(
  bytes: Uint8Array,
  name: string,
  mime?: string,
  onOcrProgress?: (done: number, pages: number) => void,
  ocrMarkers?: OcrMarkers,
  stream?: ExtractStream,
): Promise<ExtractedFile> {
  return extractFromBytes(
    asUint8(bytes),
    { name: baseName(name) || "file", mime, onOcrProgress, ocrMarkers, stream },
    nodeDeps,
  );
}

/** Extract a file's text AND scrub it in one call (document analogue of redact). */
export async function redactDocument(
  filePath: string,
  options: RedactOptions = {},
): Promise<RedactedDocument> {
  return redactExtracted(await extractText(filePath), options);
}
