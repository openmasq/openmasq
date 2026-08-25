// Node binding for the shared extraction core (@openmasq/redact/documents).
// Supplies the platform parsers (pdf.js / mammoth / OCR) and re-exports the
// SAME public API the desktop already uses: extractText / extractBytes /
// redactDocument. Heavy libs stay lazy `import()`ed so they never load unless a
// matching file is actually extracted, and never reach the renderer bundle.
import { readFile } from "node:fs/promises";
import { ocrImage, ocrImageLayout, ocrPdf } from "../ocr";
import type { RedactOptions } from "../index";
import {
  baseName,
  extractFromBytes,
  redactExtracted,
  PDF_MIN_CHARS_PER_PAGE,
  PAGE_BREAK,
  type ExtractDeps,
  type ExtractedFile,
  type RedactedDocument,
} from "./core";
import { MAX_PDF_PAGES } from "./guard";
import { reconstructPageText } from "./pdfLayout";
import { buildTextLayerPage, type TextLayerPage } from "./geometry";

export { SUPPORTED_EXTENSIONS, OCR_LANGS, OCR_TRAINEDDATA_SHA256, hybridLayerText, spatialFieldLines } from "./core";
export type { ExtractedFile, RedactedDocument, TextLayerPage, OcrLayerPage, LayerGeometry } from "./core";

/** pdfjs v4 uses Promise.withResolvers (Node 22+); polyfill for Node 20. */
function ensureWithResolvers(): void {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers === "function") return;
  (P as any).withResolvers = function <T>() {
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
): Promise<{ text: string; pages: number; imagePages: number; layout?: TextLayerPage[] }> {
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
  let imagePages = 0;
  // Per-page text-layer geometry (glyph boxes + char-run map + scale-1 page size), the
  // text-layer half of the cross-layer alignment. Built by `buildTextLayerPage`, whose
  // text IS the positional render — one reconstruction, reused as the page text.
  const layout: TextLayerPage[] | undefined = withLayout ? [] : undefined;
  try {
    const pages = Math.min(total, MAX_PDF_PAGES); // cap: a huge page count can't hang extraction
    for (let i = 1; i <= pages; i++) {
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
      // Only a page whose text is SPARSE is a scan suspect — check it for a paint-image op
      // (a text-dense page is clearly digital, so skip the extra work). `getOperatorList`
      // is bounded to those rare pages so a normal digital PDF pays nothing.
      if (IMG_OPS.size && pageText.replace(/\s/g, "").length < PDF_MIN_CHARS_PER_PAGE) {
        try {
          const opl = await page.getOperatorList();
          if ((opl.fnArray as number[]).some((fn) => IMG_OPS.has(fn))) imagePages++;
        } catch {
          /* operator list unavailable — leave the page un-flagged */
        }
      }
      page.cleanup?.();
    }
  } finally {
    await doc.destroy?.();
  }
  // Return the RENDERED page count (denominator for the density check) + how many sparse
  // pages carry an image (a scan → route to OCR; a short digital page has none → keep text).
  return { text: out.join(PAGE_BREAK), pages: Math.min(total, MAX_PDF_PAGES), imagePages, layout };
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
const pdfFlatText = (bytes: Uint8Array): Promise<{ text: string; pages: number; imagePages: number }> =>
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
    } catch {
      // The geometric reconstruction failed on an odd item stream → FLAT first-party
      // extraction on the SAME pdf.js (no external `pdf-parse`). If pdf.js itself can't
      // parse the file, this throws too → return "" so `core.ts` routes the file to OCR
      // (rasterise + read), the universal fallback for scanned / text-broken PDFs.
      try {
        return await pdfFlatText(bytes);
      } catch {
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
  // `undefined` pour lang/maxPages : les défauts de `ocrPdf` s'appliquent, seul le
  // callback de progression est threadé.
  ocrPdf: (bytes, onProgress, maxPages) => ocrPdf(bytes, undefined, maxPages, onProgress),
};

/** Extract plain text from a file on disk. Best-effort (never throws). */
export async function extractText(
  filePath: string,
  onOcrProgress?: (done: number, pages: number) => void,
  /** « Lire tout » : lever le plafond d'OCR (10 pages par défaut) — geste utilisateur. */
  ocrAllPages?: boolean,
): Promise<ExtractedFile> {
  const name = baseName(filePath);
  try {
    const bytes = new Uint8Array(await readFile(filePath));
    return await extractFromBytes(bytes, { name, onOcrProgress, ocrAllPages }, nodeDeps);
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
  ocrAllPages?: boolean,
): Promise<ExtractedFile> {
  return extractFromBytes(
    asUint8(bytes),
    { name: baseName(name) || "file", mime, onOcrProgress, ocrAllPages },
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
