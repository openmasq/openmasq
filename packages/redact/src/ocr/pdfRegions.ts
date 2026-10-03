// OCR of a page's IMAGE RECTANGLES only (`../documents/layers/imageRegions.ts`): the page is
// rendered whole as usual, then only the crops under its images are read. The words come
// back in the WHOLE page's raster space, so `OcrLayerPage` keeps one meaning for every
// consumer (the alignment, the preview's boxes) whether a page was read whole or in parts.
import type { PageFractionRect } from "../documents/layers/imageRegions";
import { ocrWordsToText, type OcrWord } from "./layout";
import { ocrImageLayout } from "./ocr";

/** Margin around each image, in raster pixels: a word straddling the image's edge (a caption
 *  over a stamp, an anti-aliased border) is read whole, not cut. */
export const REGION_PAD_PX = 12;

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: PixelBox, b: PixelBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function union(a: PixelBox, b: PixelBox): PixelBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Page fractions → padded pixel boxes on a `width`×`height` raster, clamped to it, with
 *  overlapping boxes MERGED (one word is never split between two crops). Pure. */
export function regionBoxes(regions: readonly PageFractionRect[], width: number, height: number, pad = REGION_PAD_PX): PixelBox[] {
  let boxes: PixelBox[] = regions.map((r) => {
    const x0 = Math.max(0, Math.floor(r.x0 * width) - pad);
    const y0 = Math.max(0, Math.floor(r.y0 * height) - pad);
    const x1 = Math.min(width, Math.ceil(r.x1 * width) + pad);
    const y1 = Math.min(height, Math.ceil(r.y1 * height) + pad);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }).filter((b) => b.w > 0 && b.h > 0);
  // Merge to a fixpoint: a union can reach a box an earlier pass left alone.
  for (let merged = true; merged; ) {
    merged = false;
    const out: PixelBox[] = [];
    for (const b of boxes) {
      const hit = out.findIndex((o) => overlaps(o, b));
      if (hit < 0) out.push(b);
      else {
        out[hit] = union(out[hit], b);
        merged = true;
      }
    }
    boxes = out;
  }
  return boxes;
}

/**
 * Read `boxes` of a rendered page `canvas` (an `@napi-rs/canvas` canvas) and return the
 * page's OCR as if it had been read whole: words offset back into the page raster, text
 * rebuilt from all of them in reading order. Throws like `ocrImageLayout` — a crop that
 * fails fails the page, and the caller fails the file.
 */
export async function ocrCanvasRegions(
  canvasMod: { createCanvas(w: number, h: number): any },
  canvas: any,
  boxes: readonly PixelBox[],
  lang: string,
): Promise<{ text: string; words: OcrWord[]; engines: string[] }> {
  const words: OcrWord[] = [];
  const engines: string[] = [];
  for (const b of boxes) {
    const crop = canvasMod.createCanvas(b.w, b.h);
    const cctx = crop.getContext("2d");
    // White under the crop: a transparent region would read as black on some engines.
    cctx.fillStyle = "#fff";
    cctx.fillRect(0, 0, b.w, b.h);
    cctx.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    const res = await ocrImageLayout(await crop.encode("png"), lang);
    engines.push(res.meta.engine);
    for (const w of res.words) words.push({ ...w, x0: w.x0 + b.x, x1: w.x1 + b.x, y0: w.y0 + b.y, y1: w.y1 + b.y });
  }
  return { text: ocrWordsToText(words), words, engines };
}
