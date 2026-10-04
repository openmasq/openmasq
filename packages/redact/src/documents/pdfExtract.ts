// The PDF branch of `extractFromBytes` (split out of `core.ts`, LOC cap). A PDF is read
// WHOLE or not at all: every page OCR must read is read, a document too long to mask in full
// is refused BEFORE the first page is rasterised, and an OCR failure fails the FILE — never a
// text missing the pages OCR could not read.
import { cleanErr, OCR_FAILED } from "./errors";
import { isUnreadableLayer } from "./layers/readable";
import { approxPages, CHARS_PER_PAGE, maskPlan } from "./safety/maskBudget";
import type { OcrMarkers } from "./ocrMarkers";
import type { OcrLayerPage } from "./layers/geometry";
import { PAGE_BREAK } from "./pageBreak";
import { layerMayYield, mergeThinPages, pagePrimary, yieldingPages } from "./layers/pageMerge";
import type { ExtractStream } from "./pageStream";
import { PDF_MIN_CHARS_PER_PAGE, PDF_TEXT_MIN, type ExtractDeps, type ExtractedFile, type OcrMeta } from "./core";

/** The characters masking will face, estimated BEFORE OCR. A document whose OCR may become
 *  the primary text (a scan, a mixed one) counts a dense page per page it reads; a digital
 *  one keeps its measured layer, plus a dense page per page whose thin layer may take its OCR
 *  reading (`layers/pageMerge.ts`). */
function pdfMaskEstimate(p: { layerChars: number; ocrPages: number; scanLike: boolean; yieldPages: number }): number {
  return p.scanLike ? Math.max(p.layerChars, p.ocrPages * CHARS_PER_PAGE) : p.layerChars + p.yieldPages * CHARS_PER_PAGE;
}

export async function extractPdf(
  bytes: Uint8Array,
  o: {
    name: string;
    mime?: string;
    onOcrProgress?: (done: number, pages: number) => void;
    ocrMarkers?: OcrMarkers;
    stream?: ExtractStream;
  },
  deps: ExtractDeps,
): Promise<ExtractedFile> {
  const { name, mime } = o;
  const tText = Date.now();
  const raw = await deps.pdfText(bytes);
  const rawLayer = typeof raw === "string" ? raw : raw.text;
  let text = rawLayer.trim();
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
  // WHICH pages OCR reads. A scan-like document reads EVERY page: its OCR may replace the
  // layer as the primary text, which must then be whole. A digital one reads the pages its
  // binding could not prove complete (`layers/ocrSkip.ts`); a binding that cannot tell
  // (`needsOcr` absent: the browser binding, a file pdf.js cannot parse) reads every page.
  const scanLike = noLayer || sparseScan;
  const only = scanLike || typeof raw === "string" ? undefined : raw.needsOcr;
  // …and, on a digital one, the pages it may read only where their images sit. Never on a
  // scan: its OCR may become the primary text, which must then cover the whole page.
  const regions = scanLike || typeof raw === "string" ? undefined : raw.ocrRegions;
  const ocrCount = only ? only.length : pages;

  // Refused BEFORE minutes of OCR, by the same rule masking applies once read (`maskPlan`).
  const yieldPages = scanLike ? 0 : yieldingPages(rawLayer, only);
  const estimate = pdfMaskEstimate({ layerChars: text.length, ocrPages: ocrCount, scanLike, yieldPages });
  if (maskPlan(estimate).kind === "refuse") {
    const approx = approxPages(estimate);
    return {
      name, kind: "pdf", text: "", chars: 0, mime, blocked: true,
      error: `Document too long to be masked in full (≈ ${approx} pages). Split it into several parts.`,
      errorCode: "too_long_to_mask", errorParams: { pages: approx },
    };
  }
  // Every page proved complete by its text layer: nothing to rasterise.
  if (only && only.length === 0) {
    return { name, kind: "pdf", text, chars: text.length, mime, ocr: { engine: "pdf-text", ms: layerMs }, textPages };
  }

  // OCR PROMOTES to the primary `text` for a scan, else it is the additive `ocrText` layer.
  let ocrText: string | undefined;
  let ocr: OcrMeta | undefined = { engine: "pdf-text", ms: layerMs };
  // The PREVIEW stream (`pageStream.ts`), only for a read long enough to watch: what each page
  // will FINALLY say is known now for a digital PDF (its layer stays primary), after its OCR
  // for a scan with no layer, and only at the end for a sparse scan — which streams none.
  const streamed = startStream(o.stream, deps, bytes, { rawLayer, digital: !scanLike, noLayer, only });
  // Each page's OCR reading as it is read — the source of a digital PDF's page merge when the
  // binding returns no page-indexed layout, and the same string the stream announced.
  const ocrByPage: (string | undefined)[] = [];
  const onOcrPage = (n: number, total: number, t: string) => {
    ocrByPage[n - 1] = t;
    streamed.onPage?.(n, total, t);
  };
  try {
    const res = await deps.ocrPdf(bytes, o.onOcrProgress, only, o.ocrMarkers, onOcrPage, regions);
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
        // Digital PDF: the layer stays primary — except on the pages whose thin or debris
        // layer holds their content only in the pixels: those take their OCR reading, or they
        // reach the model empty (`layers/pageMerge.ts`). The geometry (`textPages`) is kept:
        // it describes the layer, which detection still aligns against the OCR.
        const pageReads = ocrPages ? ocrPages.map((pg) => pg.text) : ocrByPage;
        const merged = mergeThinPages(rawLayer, pageReads);
        if (merged.promoted.length) text = merged.text;
        // OCR is also the SECOND layer, additive, for detection. Surface it when it says
        // something the primary text doesn't (else it's redundant noise).
        if (ocrRaw !== text) ocrText = ocrRaw;
        ocr = {
          engine: `pdf-text+${ocrMeta?.engine ?? "ocr"}`,
          ms: layerMs + (ocrMeta?.ms ?? 0),
          pages: ocrMeta?.pages,
          confidence: ocrMeta?.confidence,
          fellBack: ocrMeta?.fellBack,
          regionPages: ocrMeta?.regionPages,
        };
      }
    }
  } catch (e) {
    streamed.stop();
    // FAIL CLOSED, scan or not: the pages OCR had to read may carry what the layer misses
    // (a stamp, a filled field, a scanned insert). The file is in error — retried, never
    // sent with part of its pages. No text rides out: a thin layer is not the document.
    const c = cleanErr(e, OCR_FAILED); // the fallback STATES the fact, it does not diagnose — `errors.ts`
    return noLayer
      ? { name, kind: "pdf", text: "", chars: 0, mime, error: `PDF without a text layer — ${c.message}`, errorCode: c.code, rawCause: c.raw }
      : {
          name, kind: "pdf", text: "", chars: 0, mime, errorCode: c.code, rawCause: c.raw, errorParams: { unread: ocrCount },
          error: `${ocrCount} PDF page(s) not read — ${c.message}`,
        };
  }
  streamed.stop();
  return { name, kind: "pdf", text, chars: text.length, mime, ocrText, ocr, textPages, ocrPages };
}

/**
 * Start the preview stream of a PDF about to be OCR'd: thumbnails of every page (until
 * `stop`), the layer pages of a DIGITAL PDF at once (final: the layer stays primary), and the
 * argument that makes `ocrPdf` report each page it reads — with its text only for a scan with
 * no layer, where OCR IS the final text. The page text is `rawLayer` split on `PAGE_BREAK`,
 * the very join the final `text` is trimmed from, so the stream never disagrees with it.
 */
function startStream(
  stream: ExtractStream | undefined,
  deps: ExtractDeps,
  bytes: Uint8Array,
  p: { rawLayer: string; digital: boolean; noLayer: boolean; only?: readonly number[] },
): { onPage?: (n: number, total: number, text: string) => void; stop: () => void } {
  const stopper = new AbortController();
  const stop = () => stopper.abort();
  if (!stream) return { stop };
  const onThumb = stream.onThumb;
  if (onThumb && deps.pdfThumbnails) {
    // Display only: a thumbnail failure never touches the read.
    deps.pdfThumbnails(bytes, onThumb, stopper.signal).catch(() => undefined);
  }
  const onPage = stream.onPage;
  if (!onPage) return { stop };
  const emit = (ev: Parameters<typeof onPage>[0]) => {
    try {
      onPage(ev);
    } catch {
      /* display only */
    }
  };
  const layers = p.rawLayer.split(PAGE_BREAK);
  // A page whose thin layer may take its OCR reading (`layers/pageMerge.ts`): its final text
  // is decided when OCR reads it, so it is announced THEN, by the same rule as the result.
  const read = p.only ? new Set(p.only) : null;
  const yields = (n: number) => p.digital && (!read || read.has(n)) && layerMayYield(layers[n - 1] ?? "");
  if (p.digital) {
    // A page OCR still reads is not READ yet, but its final text (the layer's) is known.
    layers.forEach((text, i) =>
      emit({ n: i + 1, total: layers.length, read: !!read && !read.has(i + 1), ...(yields(i + 1) ? {} : { text }) }),
    );
  }
  return {
    onPage: (n, total, text) => {
      if (p.noLayer) emit({ n, total, read: true, text });
      else if (yields(n)) emit({ n, total, read: true, text: pagePrimary(layers[n - 1] ?? "", text || undefined) });
      else emit({ n, total, read: true });
    },
    stop,
  };
}
