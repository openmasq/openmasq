// The PDF branch of `extractFromBytes` (split out of `core.ts`, LOC cap). A PDF is read
// WHOLE or not at all: every page OCR must read is read, a document too long to mask in full
// is refused BEFORE the first page is rasterised, and an OCR failure fails the FILE — never a
// text missing the pages OCR could not read.
import { cleanErr, OCR_FAILED } from "./errors";
import { isUnreadableLayer } from "./layers/readable";
import { approxPages, CHARS_PER_PAGE, maskPlan } from "./safety/maskBudget";
import type { OcrMarkers } from "./ocrMarkers";
import type { OcrLayerPage } from "./layers/geometry";
import { PDF_MIN_CHARS_PER_PAGE, PDF_TEXT_MIN, type ExtractDeps, type ExtractedFile, type OcrMeta } from "./core";

/** The characters masking will face, estimated BEFORE OCR. A document whose OCR may become
 *  the primary text (a scan, a mixed one) counts a dense page per page it reads; a digital
 *  one keeps its text layer as the primary text, which is already measured. */
function pdfMaskEstimate(p: { layerChars: number; ocrPages: number; scanLike: boolean }): number {
  return p.scanLike ? Math.max(p.layerChars, p.ocrPages * CHARS_PER_PAGE) : p.layerChars;
}

export async function extractPdf(
  bytes: Uint8Array,
  o: { name: string; mime?: string; onOcrProgress?: (done: number, pages: number) => void; ocrMarkers?: OcrMarkers },
  deps: ExtractDeps,
): Promise<ExtractedFile> {
  const { name, mime } = o;
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
  // WHICH pages OCR reads. A scan-like document reads EVERY page: its OCR may replace the
  // layer as the primary text, which must then be whole. A digital one reads the pages its
  // binding could not prove complete (`layers/ocrSkip.ts`); a binding that cannot tell
  // (`needsOcr` absent: the browser binding, a file pdf.js cannot parse) reads every page.
  const scanLike = noLayer || sparseScan;
  const only = scanLike || typeof raw === "string" ? undefined : raw.needsOcr;
  const ocrCount = only ? only.length : pages;

  // Refused BEFORE minutes of OCR, by the same rule masking applies once read (`maskPlan`).
  const estimate = pdfMaskEstimate({ layerChars: text.length, ocrPages: ocrCount, scanLike });
  if (maskPlan(estimate).kind === "refuse") {
    const approx = approxPages(estimate);
    return {
      name, kind: "pdf", text: "", chars: 0, mime, blocked: true,
      error: `Document trop long pour être masqué en entier (≈ ${approx} pages). Découpez-le en plusieurs parties.`,
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
  try {
    const res = await deps.ocrPdf(bytes, o.onOcrProgress, only, o.ocrMarkers);
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
    // FAIL CLOSED, scan or not: the pages OCR had to read may carry what the layer misses
    // (a stamp, a filled field, a scanned insert). The file is in error — retried, never
    // sent with part of its pages. No text rides out: a thin layer is not the document.
    const c = cleanErr(e, OCR_FAILED); // the fallback STATES the fact, it does not diagnose — `errors.ts`
    return noLayer
      ? { name, kind: "pdf", text: "", chars: 0, mime, error: `PDF sans couche texte — ${c.message}`, errorCode: c.code, rawCause: c.raw }
      : {
          name, kind: "pdf", text: "", chars: 0, mime, errorCode: c.code, rawCause: c.raw, errorParams: { unread: ocrCount },
          error: `${ocrCount} page(s) du PDF non lue(s) — ${c.message}`,
        };
  }
  return { name, kind: "pdf", text, chars: text.length, mime, ocrText, ocr, textPages, ocrPages };
}
