import { useEffect, useMemo, useRef } from "react";
import { attachWordPicker, type PdfReplacement } from "@openmasq/redact/pdf-redact";
import type { Messages } from "@openmasq/i18n";
import { buildRevealMarks, buildTextHaloLayer } from "../pdf/pageLayers";

type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number };

/**
 * The image view of a not-yet-sent attachment: its canvas, drawn from a Blob (no blob: URL,
 * so the CSP's img-src restriction never applies). A SCAN with OCR word boxes + a map is
 * painted REDACTED (`renderRedactedImage` — fakes over the real glyphs), else the raw image;
 * then the read-zone halo, the reveal marks and the click-a-word picker, all in the image's
 * natural raster space.
 */
export function useImageCanvas(o: {
  active: boolean;
  bytes: Uint8Array | null | "error";
  mime?: string;
  words?: OcrWord[];
  replacements?: PdfReplacement[];
  displayReplacements?: PdfReplacement[];
  revealed: ReadonlySet<string>;
  editableReveal: boolean;
  onForceRedact?: unknown;
  openWordPick: (value: string, x: number, y: number, release: () => void) => void;
  t: Messages;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Image-canvas pre-highlight layers (hover wash + locked pick) — %-positioned in
  // the wrapper so they track the displayed size.
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imageWords = useMemo(
    () => (o.words ?? []).map((w) => ({ str: w.text, left: w.x0, top: w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0 })),
    [o.words],
  );
  /** The scanned image's NATURAL raster size (the OCR boxes' space). */
  const imageNaturalRef = useRef<{ w: number; h: number } | null>(null);
  const live = useRef(o);
  live.current = o;
  /** Reveal-marks for the image = the SAME builder as the PDF pages (rule 9; inspecting ≠ revealing). */
  const buildImageMarks = (boxes: Parameters<typeof buildRevealMarks>[1]) => {
    const wrap = imgWrapRef.current;
    const nat = imageNaturalRef.current;
    if (!wrap || !nat) return;
    buildRevealMarks(wrap, boxes, nat.w, nat.h, live.current.editableReveal);
  };

  const { active, bytes, mime, words, replacements, displayReplacements, revealed, onForceRedact } = o;
  useEffect(() => {
    if (!active || !bytes || bytes === "error") return;
    const cv = canvasRef.current;
    if (!cv) return;
    let alive = true;
    const paint = (src: HTMLCanvasElement | ImageBitmap) => {
      if (!alive) return;
      imageNaturalRef.current = { w: src.width, h: src.height };
      const max = 760;
      const scale = Math.min(1, max / src.width, max / src.height);
      cv.width = Math.round(src.width * scale);
      cv.height = Math.round(src.height * scale);
      cv.getContext("2d")?.drawImage(src, 0, 0, cv.width, cv.height);
    };
    let detachPicker: (() => void) | null = null;
    (async () => {
      if (words?.length && replacements?.length) {
        try {
          const { renderRedactedImage } = await import("@openmasq/redact/image-redact");
          const { canvas, boxes } = await renderRedactedImage({
            bytes,
            words,
            replacements: displayReplacements ?? [],
            reveal: revealed,
          });
          paint(canvas);
          if (alive) buildImageMarks(boxes);
          return;
        } catch {
          /* fall through to the raw image so the preview still shows something */
        }
      }
      paint(await createImageBitmap(new Blob([bytes as BlobPart], { type: mime || "" })));
      if (alive) buildImageMarks([]);
    })()
      .then(() => {
        const wrap = imgWrapRef.current;
        const cv2 = canvasRef.current;
        const nat = imageNaturalRef.current;
        if (!alive || !wrap || !nat) return;
        // Halo over the zones the OCR READ — same semantics as the PDF pages.
        if (imageWords.length) buildTextHaloLayer(wrap, imageWords, nat.w, nat.h, true, live.current.t);
        // Word-processor-style pick over the scan (same shared core as the PDF pages):
        // raster-space words, natural dims as the coordinate space.
        if (!cv2 || !onForceRedact || !imageWords.length) return;
        detachPicker = attachWordPicker({
          container: wrap,
          canvas: cv2,
          words: imageWords,
          space: { w: nat.w, h: nat.h },
          ignore: ".pdfv-mark",
          onPick: (...a) => live.current.openWordPick(...a),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      detachPicker?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, bytes, mime, words, displayReplacements, revealed, imageWords, onForceRedact]);

  return { canvasRef, imgWrapRef };
}
