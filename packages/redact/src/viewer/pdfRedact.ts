// Shared PDF-redaction render core — used by BOTH the desktop `PdfRedactedViewer`
// (packages/ui) and the extension file viewer, so the pixel-paint logic lives in
// ONE place. Framework-agnostic (no React): it renders a PDF to canvases and
// PAINTS the redaction (opaque highlight over the real glyphs + the fake drawn
// on top) directly onto each page's canvas, returning the canvases + the revealed
// regions. pdf.js is dynamic-`import()`ed (bundled by the consumer's Vite); the
// consumer passes the bundled worker URL (Vite `?url` on desktop, a bundled MV3
// asset via chrome.runtime.getURL in the extension — never remote code).
//
// Values are correlated with the page through the SAME 2D layout reconstruction the
// extractor used (`reconstructLayout` + `runs`), so a value split across several
// pdf.js text items, or spaced differently by the grid, is still painted — see
// `pdfMatch.ts` `layoutValueHits`. The pure matching half lives THERE; this file is
// only the canvas painter.
//
// VIEWER-ONLY: input bytes are read once, never modified/persisted.
import { reconstructLayout } from "../documents/serialize/pdfLayout";
import type { PdfReplacement } from "./pdfMatch";
import { paintPage, pageItems, PAGE_SCALE } from "./pdfPage";
import type {
  RedactedPdfDoc, RenderedPage, RenderRedactedPdfOptions, RenderRedactedPdfResult,
} from "./pdfTypes";

export { wordAtPoint, cleanWord, type PageWord } from "./pageWords";
export { attachWordPicker, selectionValue, type WordPickerOptions } from "./wordPicker";
export { imageSourcedWords, mergeImageZones, type ImageZone } from "./imageZones";
export type {
  RedactedPdfDoc, RenderedPage, RenderRedactedPdfOptions, RenderRedactedPdfResult,
} from "./pdfTypes";

export * from "./pdfMatch";
export * from "./pdfDerive";

const DEFAULT_MAX_PAGES = 15;

/** Concatenate every page's text (capped) — the model detects PII across the doc.
 *  Uses the SAME 2D layout reconstruction as the file extractor, so a detected value
 *  is a verbatim slice of the exact text the painter later correlates on. */
async function fullText(doc: any, pages: number): Promise<string> {
  let full = "";
  for (let p = 1; p <= pages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    full += reconstructLayout(pageItems(tc.items)).text + "\n";
  }
  return full;
}

/**
 * Open `bytes` for ON-DEMAND painting: the replacements are resolved once for the whole
 * document (detection over every page up to `maxPages`, uncapped by default), then each
 * page is painted when the consumer asks. The caller MUST `destroy()` it.
 */
export async function loadRedactedPdf(o: RenderRedactedPdfOptions): Promise<RedactedPdfDoc> {
  const redacted = o.redacted ?? true;
  const aborted = () => o.signal?.aborted;

  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = o.pdfWorkerSrc;

  // ⚠️ The bytes are an UNTRUSTED document (a drop, an attachment, a tool result), and the
  // four other `getDocument` call sites (`documents/node.ts`, `documents/browser.ts` ×2,
  // `ocr/pdf.ts`) already say so. `isEvalSupported` lets pdf.js compile font/colour
  // programs from the file through `Function(…)` — a crafted PDF then chooses code that
  // runs in the renderer, where the whole vault lives; `enableXfa` turns on the XFA
  // sub-parser, a second, far less exercised format we never need to display. Both off,
  // here too. Pinned by `pdfRedact.test.ts`, which reads EVERY call site.
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(o.bytes),
    isEvalSupported: false,
    enableXfa: false,
  }).promise;
  // pdf.js retains worker-side font/image caches + a detached copy of the page data:
  // destroyed on every exit — a failed detection here, the consumer's `destroy()` otherwise.
  const destroy = async () => {
    await doc.destroy?.();
  };
  try {
    const total: number = Math.min(doc.numPages, o.maxPages ?? Number.POSITIVE_INFINITY);
    let reps: PdfReplacement[] = o.replacements ?? [];
    let modelError: string | undefined;
    if (redacted && !o.replacements && o.getReplacements) {
      // Surface the page count before the (slow) whole-document detection so the UI
      // can show "N pages to redact · Analyzing…" instead of a blank spinner.
      o.onProgress?.({ phase: "detect", page: 0, total });
      const r = await o.getReplacements(await fullText(doc, total));
      reps = r.replacements;
      modelError = r.modelError;
    }
    return {
      total,
      pagesInFile: doc.numPages,
      modelError,
      async pageSize(p) {
        const vp = (await doc.getPage(p)).getViewport({ scale: PAGE_SCALE });
        return { cssW: vp.width, cssH: vp.height };
      },
      async renderPage(p, reveal = o.reveal) {
        const page = await doc.getPage(p);
        if (aborted()) return null;
        return paintPage(page, p, { o: { ...o, reveal }, redacted, reps, aborted });
      },
      destroy,
    };
  } catch (e) {
    await destroy();
    throw e;
  }
}

/**
 * Render `bytes` to painted canvases. Consumers append `canvas` to their DOM and
 * build a reveal layer from `boxes` (React on desktop, plain DOM in the overlay).
 */
export async function renderRedactedPdf(
  o: RenderRedactedPdfOptions,
): Promise<RenderRedactedPdfResult> {
  const d = await loadRedactedPdf({ ...o, maxPages: o.maxPages ?? DEFAULT_MAX_PAGES });
  try {
    const truncated = d.pagesInFile - d.total;
    const pages: RenderedPage[] = [];
    if (o.signal?.aborted) return { pages, truncated, modelError: d.modelError };
    for (let p = 1; p <= d.total; p++) {
      o.onProgress?.({ phase: "render", page: p, total: d.total });
      const pg = await d.renderPage(p);
      if (!pg) break;
      pages.push(pg);
    }
    return { pages, modelError: d.modelError, truncated };
  } finally {
    await d.destroy();
  }
}
