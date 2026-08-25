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
import { reconstructLayout, type PdfTextItem } from "../documents/pdfLayout";
import { layoutValueHits, ocrFallbackBoxes, type PdfReplacement, type RedactBox } from "./pdfMatch";
import {
  collectPageWords, ocrPageWords, type Matrix, type PageWord,
} from "./pageWords";
import { pageImageSource, NO_IMAGE_SOURCE } from "./imageZones";
import type { RenderedPage, RenderRedactedPdfOptions, RenderRedactedPdfResult } from "./pdfTypes";
import {
  textSegmentPatch, scanBoxPatch, applyRevealToPage, type RevealPatch,
} from "./revealPatch";

export { wordAtPoint, cleanWord, type PageWord } from "./pageWords";
export { attachWordPicker, selectionValue, type WordPickerOptions } from "./wordPicker";
export { imageSourcedWords, mergeImageZones, type ImageZone } from "./imageZones";
export type { RenderedPage, RenderRedactedPdfOptions, RenderRedactedPdfResult } from "./pdfTypes";

export * from "./pdfMatch";
export * from "./pdfDerive";

const DEFAULT_MAX_PAGES = 15;
/** The pdf.js items of one page, shaped for `reconstructLayout` with the ORIGINAL
 *  indices preserved (non-text/marked-content entries become empty items the
 *  reconstruction skips — `itemIndex` must keep addressing the raw array). */
function pageItems(raw: any[]): PdfTextItem[] {
  return raw.map((it) =>
    "str" in it ? it : { str: "", transform: [1, 0, 0, 1, 0, 0] },
  );
}

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
 * Render `bytes` to painted canvases. Consumers append `canvas` to their DOM and
 * build a reveal layer from `boxes` (React on desktop, plain DOM in the overlay).
 */
export async function renderRedactedPdf(
  o: RenderRedactedPdfOptions,
): Promise<RenderRedactedPdfResult> {
  const redacted = o.redacted ?? true;
  const maxPages = o.maxPages ?? DEFAULT_MAX_PAGES;
  const aborted = () => o.signal?.aborted;

  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = o.pdfWorkerSrc;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(o.bytes) }).promise;
  try {
  const total = doc.numPages;
  const pageCount = Math.min(total, maxPages);
  const truncated = total > pageCount ? total - pageCount : 0;

  let reps: PdfReplacement[] = o.replacements ?? [];
  let modelError: string | undefined;
  if (redacted && !o.replacements && o.getReplacements) {
    // Surface the page count before the (slow) whole-document detection so the UI
    // can show "N pages à redact · Analyse…" instead of a blank spinner.
    o.onProgress?.({ phase: "detect", page: 0, total: pageCount });
    const r = await o.getReplacements(await fullText(doc, pageCount));
    reps = r.replacements;
    modelError = r.modelError;
  }
  if (aborted()) return { pages: [], truncated, modelError };

  const dpr = Math.min((globalThis.devicePixelRatio as number) || 1, 2);
  const scale = 1.3;
  const pages: RenderedPage[] = [];

  for (let p = 1; p <= pageCount; p++) {
    o.onProgress?.({ phase: "render", page: p, total: pageCount });
    const page = await doc.getPage(p);
    if (aborted()) break;
    const vp = page.getViewport({ scale: scale * dpr });
    const cssW = vp.width / dpr;
    const cssH = vp.height / dpr;

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    // The page's NATURAL CSS size. Deliberately FIXED px: the extension overlays
    // its marks in px over this exact size. A host whose container can be narrower
    // (the desktop panel) re-styles the canvas responsive ITSELF — its overlay is
    // %-based — rather than this shared painter deciding for every consumer.
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (aborted()) break;

    const boxes: RedactBox[] = [];
    const patches: RevealPatch[] = [];
    const words: PageWord[] = [];
    let covered: ReadonlySet<string> = new Set<string>();
    const ocrGeo = o.ocrPages?.[p - 1];
    // One fetch per page, shared by the word collection, the value correlation and the
    // image-zone derivation below — the same items, read three times otherwise.
    let tcCache: any = null;
    const textContent = async () => (tcCache ??= await page.getTextContent());
    let textWords: PageWord[] = [];
    let ocrWords: PageWord[] = [];
    if (o.collectWords) {
      // The click-to-redact hit-test layer: the text layer's words, plus (for a
      // SCANNED page) the OCR words scaled to the canvas.
      const tcw = await textContent();
      if (aborted()) break;
      textWords = collectPageWords(ctx, tcw.items as any[], vp.transform as Matrix, scale, dpr);
      words.push(...textWords);
      if (ocrGeo?.words?.length) {
        ocrWords = ocrPageWords(ocrGeo.words, cssW / ocrGeo.width, cssH / ocrGeo.height);
        words.push(...ocrWords);
      }
    }
    if (redacted && reps.length) {
      const tc = await textContent();
      if (aborted()) break;
      const items = tc.items as any[];
      // Correlate on the RECONSTRUCTED page text (the extractor's own serialization),
      // then map each occurrence back to per-item sub-ranges through `runs` — so a
      // value split across items, lines or grid padding is still painted.
      const found = layoutValueHits(reconstructLayout(pageItems(items)), reps);
      covered = found.covered;

      for (const hit of found.hits) {
        const revealed = !!o.reveal?.has(hit.rep.real);
        hit.segments.forEach((seg, si) => {
          // Sub-positioned by proportional text metrics NORMALISED to the item's
          // real rendered width; the ORIGINAL pixels under the box are captured
          // first so a later reveal toggle restores them without a re-render.
          const { box, patch } = textSegmentPatch(ctx, {
            item: items[seg.itemIndex],
            segStart: seg.start,
            segEnd: seg.end,
            first: si === 0,
            vpTransform: vp.transform as Matrix,
            scale,
            dpr,
            rep: hit.rep,
            revealed,
            canvasW: canvas.width,
            canvasH: canvas.height,
          });
          boxes.push(box);
          if (patch) patches.push(patch);
        });
      }

      // SCANNED-page fallback: values the text layer left uncovered, correlated on
      // the page's OCR word geometry (see `ocrFallbackBoxes`). A pure scan enters
      // here with an EMPTY `covered`; a mixed page only for its OCR-only values.
      const ocr = ocrGeo;
      if (ocr?.words?.length && covered.size < reps.length) {
        const fb = ocrFallbackBoxes(
          reps,
          covered,
          ocr,
          vp.width / ocr.width,
          vp.height / ocr.height,
          o.reveal,
        );
        for (const deviceBox of fb.boxes) {
          const { box, patch } = scanBoxPatch(ctx, deviceBox, dpr, canvas.width, canvas.height);
          boxes.push(box);
          if (patch) patches.push(patch);
        }
        if (fb.covered.size) covered = new Set([...covered, ...fb.covered]);
      }
    }
    // What the user is LOOKING at that the text layer does not carry. Derived from the
    // OCR geometry that always accompanies a PDF here (see documents/core.ts: OCR runs
    // on every PDF, precisely so pixel-baked text is never invisible).
    const imgSrc = ocrGeo?.words?.length
      ? pageImageSource({
          layerText: reconstructLayout(pageItems((await textContent()).items as any[])).text,
          ocrWords,
          textWords,
          wantZones: !!o.collectWords,
        })
      : NO_IMAGE_SOURCE;
    if (aborted()) break;
    // Identity-based subtraction: `imageWords` are the very objects pushed into `words`.
    const imgWords = new Set<PageWord>(imgSrc.imageWords);
    pages.push({
      canvas,
      boxes,
      words,
      wireWords: imgWords.size ? words.filter((w) => !imgWords.has(w)) : words,
      imageZones: imgSrc.zones,
      imageOnly: imgSrc.imageOnly,
      cssW,
      cssH,
      covered,
      applyReveal: (reveal) => applyRevealToPage(ctx, patches, reveal),
    });
  }

  return { pages, modelError, truncated };
  } finally {
    // pdf.js retains worker-side font/image caches + a detached copy of the page data.
    // Destroy on EVERY exit (the abort early-return above, a mid-loop throw), not only
    // the normal end — a reveal/re-redact toggle aborts + re-runs this render, which
    // would orphan a document per toggle otherwise (a real leak across a viewing session).
    await doc.destroy?.();
  }
}
