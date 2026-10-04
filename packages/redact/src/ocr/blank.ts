// Is a rendered page BLANK — no ink at all? Then OCR can read nothing on it, and a page that
// carries no pixel of ink cannot hide a value: skipping it is not a privacy trade-off, it is
// ~2 s saved per empty page (OCR still ran on them: docTR finds no region on white, so the
// router fell back to the 12-language Tesseract pass for nothing).
//
// FAIL CLOSED: a pixel counts as ink as soon as it is not near-white, whatever its alpha (only
// a fully transparent pixel is paper). A faint grey, a scanner's noise, a hairline: inked — read.

/** At or above this on EVERY channel, a pixel is paper. */
const PAPER = 250;

/** True when no pixel of the RGBA raster `data` carries ink. */
export function isBlankRaster(data: ArrayLike<number>): boolean {
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (data[i] < PAPER || data[i + 1] < PAPER || data[i + 2] < PAPER) return false;
  }
  return true;
}
