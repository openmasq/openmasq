// WORD geometry of a rendered page — the hit-test layer behind "click a word on
// the redacted canvas → Redact «word»". The painter can only paint the values
// the detector found; a MISSED value is invisible to it, so the consumer needs
// every word's box to let the user point at one and force-redact it. Two
// sources, same output space (CSS px, top-left origin):
//   • the pdf.js TEXT layer — same proportional measureText metrics the painter
//     uses for its segment boxes (proxy font ≠ PDF font; the ratio places it);
//   • the OCR words of a SCANNED page — raster boxes scaled to the canvas.
import type { OcrWord } from "../ocr/layout";

/** One word of a rendered page, in CSS px (the marks-layer coordinate space). */
export interface PageWord {
  str: string;
  left: number;
  top: number;
  w: number;
  h: number;
}

export type Matrix = [number, number, number, number, number, number];

/** 2D affine compose (pdf.js Util.transform): m1 ∘ m2. */
export function mul(m1: Matrix, m2: number[]): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Measure-text context — the one canvas API this module needs (testable with a stub). */
export interface TextMeasurer {
  font: string;
  measureText(s: string): { width: number };
}

/**
 * The word boxes of one page's pdf.js text items (CSS px). Same metric derivation
 * as the painter's segment boxes: glyph height from the composed transform, widths
 * proportional to `measureText` normalised to the item's real rendered width.
 */
export function collectPageWords(
  ctx: TextMeasurer,
  items: { str?: string; width?: number; transform?: number[] }[],
  vpTransform: Matrix,
  scale: number,
  dpr: number,
): PageWord[] {
  const out: PageWord[] = [];
  for (const item of items) {
    const str = item?.str ?? "";
    if (!str.trim()) continue;
    const m = mul(vpTransform, (item.transform as number[]) ?? [1, 0, 0, 1, 0, 0]);
    const fh = Math.hypot(m[2], m[3]) || 12 * dpr;
    const wpx = (item.width || 0) * scale * dpr || fh;
    ctx.font = `${fh * 0.82}px Helvetica, Arial, sans-serif`;
    const totalW = ctx.measureText(str).width || str.length || 1;
    const k = wpx / totalW;
    const re = /\S+/g;
    let w: RegExpExecArray | null;
    while ((w = re.exec(str)) !== null) {
      const left = m[4] + ctx.measureText(str.slice(0, w.index)).width * k;
      out.push({
        str: w[0],
        left: left / dpr,
        top: (m[5] - fh * 0.85) / dpr,
        w: Math.max(ctx.measureText(w[0]).width * k, 2) / dpr,
        h: (fh * 1.12) / dpr,
      });
    }
  }
  return out;
}

/** The OCR words of a scanned page, scaled raster→CSS px. */
export function ocrPageWords(
  words: OcrWord[],
  sx: number,
  sy: number,
): PageWord[] {
  return (words ?? [])
    .filter((w) => w.text?.trim())
    .map((w) => ({
      str: w.text,
      left: w.x0 * sx,
      top: w.y0 * sy,
      w: (w.x1 - w.x0) * sx,
      h: (w.y1 - w.y0) * sy,
    }));
}

/** The word under a point (CSS px), or null — the click hit-test. */
export function wordAtPoint(words: PageWord[], x: number, y: number): PageWord | null {
  return (
    words.find((w) => x >= w.left && x <= w.left + w.w && y >= w.top && y <= w.top + w.h) ?? null
  );
}

/** A clicked word stripped of its clinging punctuation ("Rebour," → "Rebour"). */
export function cleanWord(str: string): string {
  return str.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
