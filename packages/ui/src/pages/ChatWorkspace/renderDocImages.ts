import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { renderRedactedPdf, type PdfReplacement } from "@openmasq/redact/pdf-redact";
import type { LlmAttachment } from "@openmasq/llm";
import { paintCoversReplacements } from "../../send/sendGuards";

/** Encode a rendered page canvas. With `maxEdge` set we downscale (longest edge
 *  capped) + export JPEG onto a WHITE background (JPEG has no alpha → would flatten
 *  transparent pixels to black otherwise) — this shrinks the payload dramatically vs
 *  a full-res PNG, which matters for the metered gateway's body-size limit. Without
 *  `maxEdge` it stays a lossless full-res PNG (the previous behaviour). */
function encodePage(
  src: HTMLCanvasElement,
  maxEdge?: number,
  quality?: number,
): LlmAttachment | null {
  if (!maxEdge) {
    const b64 = src.toDataURL("image/png").split(",")[1] ?? "";
    return b64 ? { kind: "image", mediaType: "image/png", dataBase64: b64 } : null;
  }
  const longest = Math.max(src.width, src.height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const b64 = c.toDataURL("image/jpeg", quality ?? 0.85).split(",")[1] ?? "";
  return b64 ? { kind: "image", mediaType: "image/jpeg", dataBase64: b64 } : null;
}

/**
 * Render a PDF's REDACTED pages to images for a vision model — so the user can
 * send the redacted DOCUMENT (layout/tables preserved) instead of extracted text.
 * Reuses the same pixel-paint core as the viewer (`renderRedactedPdf`): each page
 * is painted with the fakes over the real glyphs, then exported as base64. The
 * images therefore contain ONLY fakes — safe to send. `replacements` come from the
 * conversation vault (deterministic, matches the wire). Best-effort: returns [] on
 * failure so the caller can fall back to text.
 */
export async function pdfToRedactedImages(
  bytes: Uint8Array,
  replacements: PdfReplacement[],
  opts?: {
    signal?: AbortSignal;
    onProgress?: (p: { phase: "detect" | "render"; page: number; total: number }) => void;
    /** REAL values the user revealed in the preview → painted in CLEAR in the image. */
    reveal?: ReadonlySet<string>;
    /** Cap each page's longest edge (px) → downscaled JPEG instead of full-res PNG,
     *  to fit the metered gateway's body limit. Omit for lossless full-res PNG. */
    maxEdge?: number;
    /** JPEG quality (0–1) when `maxEdge` is set. Default 0.85 (legible text, small). */
    quality?: number;
    /** Per-page OCR word geometry (`ExtractedFile.ocrPages`) — lets a SCANNED page
     *  paint its boxes from the OCR words, so the coverage gate below can accept
     *  painted scans instead of always refusing them. */
    ocrPages?: import("@openmasq/redact/pdf-redact").RenderRedactedPdfOptions["ocrPages"];
  },
): Promise<LlmAttachment[]> {
  const { pages } = await renderRedactedPdf({
    bytes,
    redacted: true,
    replacements,
    ocrPages: opts?.ocrPages,
    reveal: opts?.reveal,
    pdfWorkerSrc: workerUrl,
    signal: opts?.signal,
    onProgress: opts?.onProgress,
  });
  // ⚠️ FAIL-CLOSED INVARIANT (audit H2): `renderRedactedPdf` paints the fakes on the
  // pdf.js TEXT LAYER (correlated through the extractor's own layout reconstruction),
  // and reports per page WHICH values its paint covered. `paintCoversReplacements` is
  // a PER-VALUE proof over that: it refuses when nothing was painted at all (a SCANNED
  // PDF — no text layer, raw pixels would ship as "redacted") AND when any single
  // expected replacement is covered on no page (an OCR-layer stamp, a scan page of a
  // mixed PDF, a page past the render cap — its pixels would leave in CLEAR while the
  // rest of the doc looks redacted). Either way we refuse to emit images and return []
  // so the caller falls back to the (safe) extracted-TEXT path. `replacements` must be
  // this DOCUMENT's drop-time map (see the gate's caller contract in `sendGuards.ts`).
  if (!paintCoversReplacements(pages, replacements, opts?.reveal)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[renderDocImages] refusing to send PDF as images — the paint does not cover " +
        "every pending redaction (scanned page, OCR-only value, or a value past the " +
        "page cap); falling back to the extracted-text path.",
    );
    return [];
  }
  const out: LlmAttachment[] = [];
  for (const pg of pages) {
    const att = encodePage(pg.canvas, opts?.maxEdge, opts?.quality);
    if (att) out.push(att);
  }
  return out;
}

/** A PDF is the only format we can currently paint-redact to images. */
export function canSendAsImages(name: string, mime?: string): boolean {
  return mime === "application/pdf" || /\.pdf$/i.test(name);
}
