import type { OcrWord } from "./layout";

/**
 * The regions an engine DETECTED but rendered as GARBAGE — and the targeted re-read.
 *
 * The case that founds this module (real scanned CNI, 14/08): the MRZ band — OCR-B font,
 * chevrons — is detected by docTR but its CRNN (ordinary Latin vocabulary) renders it
 * as « - » at confidence 63. Above the floor (25), so neither dropped nor marked unreadable:
 * a dash takes the place of a line carrying NAME, first names, encoded birth date and
 * number — invisible to redaction, readable to the eye. Tesseract, for its part, reads the band at 86+.
 *
 * The rule is GEOMETRIC, not MRZ-specific: a text of ≤ 2 characters in a box
 * whose width is ≥ 4 heights is garbage — no real short word occupies such a
 * box (a real dash lives in a narrow box), and real wide text fills the
 * box. The re-read is the SAFE direction of the router, already documented: « Tesseract reads what
 * docTR couldn't — never a leak ».
 */

export interface GarbledRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Minimum width, in box heights, for a derisory text to be garbage. */
const MIN_ASPECT = 4;
/** Beyond this number of characters (letters/digits), the word explains its box. */
const MAX_JUNK_CHARS = 2;
/** Re-read margin around the box (as a fraction of its height) — Tesseract reads
 *  better with a bit of breathing room, and docTR's detection sometimes crops the glyphs tight. */
const PAD = 0.5;

/** A page's suspicious boxes, ready for `SetRectangle` (full-image coordinates —
 *  the Tesseract API doesn't re-origin, so the re-read words land back in the right place). */
export function garbledBoxes(
  words: readonly OcrWord[],
  page: { width: number; height: number },
): GarbledRect[] {
  const out: GarbledRect[] = [];
  for (const w of words) {
    const bw = w.x1 - w.x0;
    const bh = Math.max(1, w.y1 - w.y0);
    if (bw < MIN_ASPECT * bh) continue;
    const signes = w.text.replace(/[^\p{L}\p{N}]/gu, "").length;
    if (signes > MAX_JUNK_CHARS && w.text.trim().length > MAX_JUNK_CHARS + 1) continue;
    const pad = bh * PAD;
    const left = Math.max(0, w.x0 - pad);
    const top = Math.max(0, w.y0 - pad);
    out.push({
      left,
      top,
      width: Math.min(page.width, w.x1 + pad) - left,
      height: Math.min(page.height, w.y1 + pad) - top,
    });
  }
  return out;
}

/** True if `w` is one of the garbage words a box in `rects` came from — the
 *  original word is REMOVED when its re-read replaces it (otherwise the ghost dash stays
 *  in the reconstructed text, in the middle of the re-read line). */
export function isGarbledWord(w: OcrWord, rects: readonly GarbledRect[]): boolean {
  return rects.some(
    (r) => w.x0 >= r.left - 1 && w.x1 <= r.left + r.width + 1 && w.y0 >= r.top - 1 && w.y1 <= r.top + r.height + 1,
  );
}
