// Sizing + pagination for the "document page" view of extracted text. The extracted
// text (esp. a PDF's layout-reconstructed 2D character grid — `pdftotext -layout` style)
// is a MONOSPACE grid: it only reads correctly when a line stays on ONE line, and it
// should look like a real PAGE (portrait sheet) — one sheet PER document page. So we:
//   • split the text on the extraction's page-break marker (`\f`) → one sheet per page;
//   • size each sheet's WIDTH to the document's BODY width (robust to a lone wide
//     header/footer, which otherwise stretched the sheet and left the body a big right
//     gap — the reported "trop d'espace à droite");
//   • fit the font so that body width fills the sheet (widen the sheet up to a page-like
//     cap, then shrink the text) — the "respect the proportions" behaviour.
// Pure + unit-testable (no DOM).

/** The extraction's page-break marker (form feed), inserted between document pages. */
export const PAGE_BREAK = "\f";

/** Split extracted text into per-page strings on the page-break marker, dropping pages
 *  with no visible content (a blank sheet reads as a bug). Always ≥1 entry. */
export function splitPages(text: string): string[] {
  const pages = text.split(PAGE_BREAK).map((p) => p.replace(/^\n+|\n+$/g, ""));
  const kept = pages.filter((p) => p.trim().length > 0);
  return kept.length ? kept : [text];
}

/** The longest line length (in characters) across the text. */
export function maxLineLength(text: string): number {
  let max = 0;
  for (const line of text.split("\n")) if (line.length > max) max = line.length;
  return max;
}

/** The value at percentile `q` (0..1) of a sorted-ascending numeric array. */
function percentile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(q * (sortedAsc.length - 1))));
  return sortedAsc[i];
}

/** Comfortable base font; the text never grows past this. */
export const DOC_BASE_FS = 13;
/** Floor: below this the text is unreadable, so we stop shrinking and let the sheet
 *  scroll horizontally instead (a genuinely huge grid). */
export const DOC_MIN_FS = 8;
/** Hard cap on the column count so a pathological single-giant-line file can't shrink
 *  the font to nothing. */
export const DOC_MAX_COLS = 150;
/** Monospace advance width as a fraction of the em (Space Mono ≈ 0.6; rounded UP so the
 *  fit errs toward a slightly smaller font that's guaranteed not to overflow). */
export const DOC_CHAR_W = 0.62;
/** Page-like width bounds (px) so a sheet reads as a PAGE, not a banner or a sliver. */
export const DOC_PAGE_MIN_W = 460;
export const DOC_PAGE_MAX_W = 900;
/** Total horizontal padding of the sheet (both margins) — keep in sync with `.fv-page`. */
export const DOC_PAGE_PAD_X = 96;

/**
 * The column count to size a page to: the document's BODY width. Normally the true widest
 * line, so the layout grid never wraps — BUT when that widest line is a clear OUTLIER (a
 * lone right-aligned header/footer far wider than the body), size to a high-percentile
 * width instead, so the sheet tracks the body (no big right gap) and only the rare
 * outlier wraps. Capped at {@link DOC_MAX_COLS}.
 */
export function bodyCols(text: string): number {
  const lens = text
    .split("\n")
    .map((l) => l.length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (!lens.length) return 0;
  const max = lens[lens.length - 1];
  const p90 = percentile(lens, 0.9);
  // A widest line >30% past the 90th-percentile line is an outlier → don't let it stretch
  // the sheet; size to the 96th percentile (the outlier then wraps).
  const cols = max > p90 * 1.3 ? percentile(lens, 0.96) : max;
  return Math.min(cols, DOC_MAX_COLS);
}

function clamp(lo: number, v: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The sheet width (px), font size (px) + overflow flag for a document whose body is
 * `cols` columns wide, given the available `availWidth`. The sheet follows the body at
 * the base font, bounded to page-like limits; as the viewport narrows the font SHRINKS
 * so the body keeps filling the sheet without wrapping (proportions respected — the
 * "reduce the text, don't reflow" behaviour). Only when even the readable FLOOR font
 * can't fit does the sheet give up shrinking: it holds the floor and reports
 * `overflow`, so the renderer lets the text SCROLL horizontally rather than wrap and
 * break a reconstructed layout grid. A cap-clamped line (`cols === DOC_MAX_COLS`, i.e.
 * long prose) is NOT flagged — it wraps normally. `cols <= 0` (empty) → a base-size
 * min-width sheet.
 */
export function pageMetrics(
  cols: number,
  availWidth: number,
): { pageWidth: number; fontSize: number; overflow: boolean } {
  const c = Math.max(1, cols);
  const cap = Math.min(availWidth > 0 ? availWidth : DOC_PAGE_MAX_W, DOC_PAGE_MAX_W);
  const lo = Math.min(DOC_PAGE_MIN_W, cap);
  const contentAtBase = c * DOC_CHAR_W * DOC_BASE_FS;
  const pageWidth = clamp(lo, contentAtBase + DOC_PAGE_PAD_X, cap);
  const inner = pageWidth - DOC_PAGE_PAD_X;
  const idealFont = cols <= 0 ? DOC_BASE_FS : inner / (c * DOC_CHAR_W);
  // Below the floor the body can't fit at a readable size: hold the floor and scroll,
  // rather than wrap. Only a genuinely-fitted grid scrolls (a cap-clamped prose line
  // is left to wrap on its own).
  const overflow = idealFont < DOC_MIN_FS && cols > 0 && cols < DOC_MAX_COLS;
  const fontSize = clamp(DOC_MIN_FS, idealFont, DOC_BASE_FS);
  return { pageWidth: Math.round(pageWidth), fontSize: Math.round(fontSize * 100) / 100, overflow };
}
