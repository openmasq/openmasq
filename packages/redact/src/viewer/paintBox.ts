// The ONE box-paint primitive for a redacted value on a canvas — the scanned page, the
// scanned image AND the PDF text layer. Shared by `imageRedact.ts` and `revealPatch.ts`
// so the palette, the geometry and the type-setting live in one place.
import type { RedactBox } from "./pdfMatch";
import { tonePaint } from "./tonePaint";

// The palette is THEME-RESOLVED (`tonePaint`) — see that module for why a frozen table
// here was a bug. Re-exported so existing importers keep their path.
export { TONE_RGB, INK, tonePaint } from "./tonePaint";

/**
 * PADDING, as a fraction of the box height.
 *
 * A value's box comes from glyph metrics (OCR word boxes, or pdf.js item metrics), so it
 * hugs the letters: on screen that reads as a bar CLIPPING the ascenders and descenders
 * of the very word it replaces, and two marks on the same line never line up. Growing it
 * a little turns it into what it means — a highlighter stroke over the word.
 *
 * ⚠️ Padding may only ever GROW the box. The fill is what covers the real glyphs
 * (`imageRedact`/`revealPatch` both rely on it being opaque), so a box that shrank would
 * leak pixels of the real value. Same reason the corner radius is capped BELOW the
 * padding: a rounded corner cuts into the rectangle, and it must only ever cut into the
 * padding we just added, never into the original tight box.
 */
const PAD_X = 0.08;
const MIN_PAD = 1;

/**
 * Vertical padding, as a fraction of box height — and it depends on WHICH geometry the
 * box came from, which is the one thing the two painters do not share.
 *
 * An OCR word box hugs the glyphs, so it has real headroom to grow into: `GLYPH`.
 * A pdf.js text-layer box is already a LINE box (`revealPatch.ts` builds it as
 * `1.12 × font height`, spanning ascender to descender), so on a normal 1.15–1.2×
 * leading it fills the line to within ~1px. Padding it does not make a nicer highlight,
 * it reaches into the NEXT line: measured, 0.16 overlapped consecutive lines by 28–33%
 * of the font height. Hence `LINE = 0` — the box is not grown vertically at all.
 */
export const PAD_Y_GLYPH = 0.16;
export const PAD_Y_LINE = 0;

/** Smallest type we will shrink a fake to before giving up on fitting it. Below this it
 *  is not "small", it is unreadable — and an unreadable fake is worse than a wrapped one. */
const MIN_FONT = 7;

export interface Rect {
  left: number;
  top: number;
  w: number;
  h: number;
}

/** The padding added around a box. One definition, so the inflate, the radius cap and the
 *  text inset can never disagree. `padY` selects the geometry (see `PAD_Y_*`); a zero
 *  fraction means zero growth, so the MIN_PAD floor must not resurrect it. */
export function padFor(tight: Rect, padY: number = PAD_Y_GLYPH): { x: number; y: number } {
  return {
    x: Math.max(MIN_PAD, tight.h * PAD_X),
    y: padY > 0 ? Math.max(MIN_PAD, tight.h * padY) : 0,
  };
}

/** Grow a box into a highlight box. Pure — the geometry is testable and the painters share
 *  exactly one definition of it. ⚠️ The reveal CAPTURE must pass the same `padY` as the
 *  paint, or un-redacting leaves a halo (or misses a painted strip). */
export function inflate(tight: Rect, padY?: number): Rect {
  const p = padFor(tight, padY);
  return { left: tight.left - p.x, top: tight.top - p.y, w: tight.w + p.x * 2, h: tight.h + p.y * 2 };
}

/**
 * The corner radius for the box that inflating `tight` produces.
 *
 * ⚠️ Takes the TIGHT box, never the inflated one. Computed from the inflated height it
 * comes out LARGER than the padding actually added, and a corner then bites into the
 * original glyph rect — i.e. it exposes pixels of the real value at the four corners.
 * `paintBox.test.ts` pins that it can never exceed the padding; that test caught exactly
 * this, which is why the parameter is named for what it must be.
 */
export function cornerRadius(tight: Rect, padY?: number): number {
  const p = padFor(tight, padY);
  return Math.min(tight.h * 0.18, p.x, p.y, (tight.w + p.x * 2) / 2);
}

/**
 * The font size at which `text` fits `maxW`, starting from `ideal` and shrinking.
 *
 * This is the fix for the thing that actually looked broken: the box is sized on the
 * REAL value, the fake replacing it is routinely LONGER ("Vaudel" → "Grandjean"), and both
 * painters clipped it — so the document showed a fake cut off mid-word, which a reader
 * cannot tell apart from a real truncated value. Shrinking to fit keeps it whole and
 * legible; below `MIN_FONT` we stop shrinking and let the caller widen instead.
 */
export function fitFontPx(
  ctx: { measureText: (s: string) => { width: number }; font: string },
  text: string,
  maxW: number,
  ideal: number,
  family = "Helvetica, Arial, sans-serif",
): number {
  if (!text) return ideal;
  const widthAt = (px: number) => {
    ctx.font = `${px}px ${family}`;
    return ctx.measureText(text).width;
  };
  if (widthAt(ideal) <= maxW) return ideal;
  // Proportional first guess (text width is ~linear in font size), then a couple of
  // corrective steps — cheaper and steadier than a binary search over ~8 sizes.
  let px = Math.max(MIN_FONT, (ideal * maxW) / (widthAt(ideal) || 1));
  for (let i = 0; i < 3 && widthAt(px) > maxW && px > MIN_FONT; i++) px = Math.max(MIN_FONT, px * 0.92);
  return px;
}

/** What a display TOKEN is painted as. Three bullets: short enough to sit at a legible
 *  size in ANY box, whatever the word it covers. */
export const TOKEN_DOTS = "•••";

/**
 * What to typeset inside a box.
 *
 * A pseudonym is painted as-is: it is about as long as the value it replaces, and
 * {@link fitFontPx} absorbs the rest. A display TOKEN (`[PERSON1]`, `[COMPANY_ID2]` —
 * the `redactTokenDisplay` rendering) is a different problem: it is long AND unrelated
 * to the word's width, so over a short value it shrank to `MIN_FONT` and then CLIPPED.
 * A box reading « [COMP… » tells the reader nothing and looks broken.
 *
 * So a token is painted `•••`. Nothing is lost on this surface: the box already carries
 * its category as its TONE, and the exact token stays one hover away (the reveal card)
 * and in the redacted TEXT views.
 *
 * ⚠️ Canvas only. The selectable views must keep the distinct token per value —
 * `realFromRedactedSelection` maps a selected span back to its real value BY that
 * string, so painting every span the same would map them all to one value, and that
 * feeds « Redact ce mot ». Pinned by `paintBox.test.ts`.
 */
export function boxLabel(fake: string): string {
  return /^\[[A-Z][A-Z0-9_]*\]$/.test(fake) ? TOKEN_DOTS : fake;
}

/**
 * Paint ONE non-revealed value box: the padded, rounded tone fill over the real glyphs,
 * then the fake typeset to FIT inside it.
 *
 * `baseline` is the text baseline in canvas coords when the caller has one (the PDF text
 * layer does — sitting the fake on the document's own baseline is what makes it read as
 * part of the line); without it the fake is centred, which is right for an OCR box whose
 * baseline is unknown.
 */
export function paintValueBox(
  ctx: CanvasRenderingContext2D,
  box: Rect & { fake: string; tone: string },
  opts: { baseline?: number; idealFont?: number; padY?: number } = {},
): void {
  const { fill, ink } = tonePaint(box.tone);
  const r = inflate(box, opts.padY);
  const radius = cornerRadius(box, opts.padY); // from the TIGHT box — see `cornerRadius`

  ctx.fillStyle = fill;
  ctx.beginPath();
  // `roundRect` is in every engine this ships to (Chromium ≥ 99); the guard keeps a
  // DOM-less/older 2D context painting a square box rather than throwing — a missing
  // fill would expose the real glyphs, which is the one outcome we cannot have.
  if (typeof ctx.roundRect === "function") ctx.roundRect(r.left, r.top, r.w, r.h, radius);
  else ctx.rect(r.left, r.top, r.w, r.h);
  ctx.fill();

  if (!box.fake) return;
  const label = boxLabel(box.fake);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.left, r.top, r.w, r.h);
  ctx.clip(); // a belt: the fit below should already keep the fake inside
  const ideal = opts.idealFont ?? box.h * 0.82;
  const inset = padFor(box).x;
  const inner = r.w - inset * 2;
  ctx.font = `${fitFontPx(ctx, label, inner, ideal)}px Helvetica, Arial, sans-serif`;
  ctx.fillStyle = ink;
  if (opts.baseline != null) {
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, r.left + inset, opts.baseline);
  } else {
    ctx.textBaseline = "middle";
    ctx.fillText(label, r.left + inset, r.top + r.h / 2);
  }
  ctx.restore();
}

/** Paint one NON-revealed OCR-geometry box (scan page, scanned image). */
export function paintScanBox(ctx: CanvasRenderingContext2D, box: RedactBox): void {
  paintValueBox(ctx, box);
}
