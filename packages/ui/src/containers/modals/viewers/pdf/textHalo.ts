/**
 * Geometry of the HALO over detected text zones — pure, unit-tested.
 *
 * The halo tells the user "this was READ (and therefore goes out, redacted, to the model)";
 * what carries none was not read. To be pleasant AND representative, we draw
 * neither a rectangle per WORD (confetti constellation) nor the bounding box of a
 * paragraph (it would cover empty space on short lines): the words are merged into
 * LINE BANDS — one band per actually-written line segment, inflated by a margin
 * proportional to the text height. The render (`.pdfv-texthalo`) has SHARP edges —
 * a flat wash, no blur: the read/unread boundary is information, and a gradient would
 * make it undecidable exactly where it matters.
 *
 * Inputs in px (the page's CSS space or an image's natural raster); outputs in
 * the same space — the caller converts to % to follow the responsive page.
 */

export interface HaloBox {
  left: number;
  top: number;
  w: number;
  h: number;
}

export type HaloRegion = HaloBox;

/** Two words on the same line merge if the horizontal gap ≤ this factor × the line
 *  height — wide enough to absorb inter-word spacing and punctuation, narrow
 *  enough to leave two distinct COLUMNS (a gutter is several heights wide). */
const GAP_FACTOR = 1.6;
/** Inflation margins, as a fraction of line height — small so as not to annex
 *  the document's margins (with sharp edges, the band IS the shown boundary). */
const PAD_X = 0.45;
const PAD_Y = 0.24;
/** Two boxes belong to the same LINE if their vertical overlap reaches this
 *  fraction of the smaller of the two heights. */
const LINE_OVERLAP = 0.45;

const finite = (b: HaloBox): boolean =>
  Number.isFinite(b.left) && Number.isFinite(b.top) && Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0;

interface Line {
  y0: number;
  y1: number;
  boxes: HaloBox[];
}

/** Merges word boxes into inflated line bands, bounded to `bounds`. */
export function haloRegions(
  boxes: readonly HaloBox[],
  bounds: { w: number; h: number },
): HaloRegion[] {
  const clean = boxes.filter(finite);
  if (!clean.length) return [];

  // 1. Group into LINES by vertical overlap (the boxes arrive in some
  // arbitrary order: text layer then OCR words — sort by vertical center first).
  const sorted = [...clean].sort((a, b) => a.top + a.h / 2 - (b.top + b.h / 2));
  const lines: Line[] = [];
  for (const b of sorted) {
    const last = lines[lines.length - 1];
    const overlap = last ? Math.min(last.y1, b.top + b.h) - Math.max(last.y0, b.top) : 0;
    if (last && overlap >= LINE_OVERLAP * Math.min(b.h, last.y1 - last.y0)) {
      last.boxes.push(b);
      last.y0 = Math.min(last.y0, b.top);
      last.y1 = Math.max(last.y1, b.top + b.h);
    } else {
      lines.push({ y0: b.top, y1: b.top + b.h, boxes: [b] });
    }
  }

  // 2. Within each line: merge into segments (a gap > GAP_FACTOR × height separates —
  // this is what keeps two distinct columns), then inflate bounded to the page.
  const out: HaloRegion[] = [];
  for (const line of lines) {
    const h = line.y1 - line.y0;
    const runs = line.boxes.sort((a, b) => a.left - b.left);
    let x0 = runs[0].left;
    let x1 = runs[0].left + runs[0].w;
    const flush = () => {
      const padX = PAD_X * h;
      const padY = PAD_Y * h;
      const left = Math.max(0, x0 - padX);
      const top = Math.max(0, line.y0 - padY);
      out.push({
        left,
        top,
        w: Math.min(bounds.w - left, x1 - x0 + 2 * padX),
        h: Math.min(bounds.h - top, h + 2 * padY),
      });
    };
    for (const b of runs.slice(1)) {
      if (b.left - x1 > GAP_FACTOR * h) {
        flush();
        x0 = b.left;
      }
      x1 = Math.max(x1, b.left + b.w);
    }
    flush();
  }
  return out;
}
