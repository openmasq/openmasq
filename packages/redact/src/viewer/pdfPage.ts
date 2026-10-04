// One page of the painter: render the pdf.js page to a canvas, then paint the masking
// over it (text-layer correlation, then the OCR fallback of a scan). Split from
// `pdfRedact.ts` so a consumer can paint pages ON DEMAND (the desktop viewer renders only
// what is near the viewport) with the exact same per-page logic as the batch render.
import { reconstructLayout, type PdfTextItem } from "../documents/serialize/pdfLayout";
import { layoutValueHits, ocrFallbackBoxes, type PdfReplacement, type RedactBox } from "./pdfMatch";
import {
  collectPageWords, ocrPageWords, type Matrix, type PageWord,
} from "./pageWords";
import { pageImageSource, NO_IMAGE_SOURCE } from "./imageZones";
import type { RenderedPage, RenderRedactedPdfOptions } from "./pdfTypes";
import {
  textSegmentPatch, scanBoxPatch, applyRevealToPage, type RevealPatch,
} from "./revealPatch";

/** The pdf.js items of one page, shaped for `reconstructLayout` with the ORIGINAL
 *  indices preserved (non-text/marked-content entries become empty items the
 *  reconstruction skips — `itemIndex` must keep addressing the raw array). */
export function pageItems(raw: any[]): PdfTextItem[] {
  return raw.map((it) =>
    "str" in it ? it : { str: "", transform: [1, 0, 0, 1, 0, 0] },
  );
}

export interface PaintContext {
  o: Pick<RenderRedactedPdfOptions, "ocrPages" | "collectWords" | "reveal">;
  redacted: boolean;
  reps: PdfReplacement[];
  aborted: () => boolean | undefined;
  /** Paint at this canvas width (device px) — a thumbnail; absent = the natural size. */
  width?: number;
}

/** CSS px per PDF point: a page's natural CSS size is its viewport at this scale. */
export const PAGE_SCALE = 1.3;

/** Paint page `p` (1-based) of an open pdf.js `page`. `null` when aborted mid-way. */
export async function paintPage(page: any, p: number, c: PaintContext): Promise<RenderedPage | null> {
  const { o, redacted, reps, aborted } = c;
  // A thumbnail is painted at its own small size, at 1:1 — same masks, a fraction of the pixels.
  const natural = c.width ? page.getViewport({ scale: 1 }).width : 0;
  const dpr = c.width ? 1 : Math.min((globalThis.devicePixelRatio as number) || 1, 2);
  const scale = c.width && natural > 0 ? c.width / natural : PAGE_SCALE;
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
  if (aborted()) return null;

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
    if (aborted()) return null;
    textWords = collectPageWords(ctx, tcw.items as any[], vp.transform as Matrix, scale, dpr);
    words.push(...textWords);
    if (ocrGeo?.words?.length) {
      ocrWords = ocrPageWords(ocrGeo.words, cssW / ocrGeo.width, cssH / ocrGeo.height);
      words.push(...ocrWords);
    }
  }
  if (redacted && reps.length) {
    const tc = await textContent();
    if (aborted()) return null;
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
  if (aborted()) return null;
  // Identity-based subtraction: `imageWords` are the very objects pushed into `words`.
  const imgWords = new Set<PageWord>(imgSrc.imageWords);
  return {
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
  };
}
