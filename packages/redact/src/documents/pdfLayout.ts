// Layout-aware serialization of a PDF's / OCR's text (approach A, geometric variant).
//
// pdf.js `getTextContent()` (and Tesseract's positioned words) give each text item
// WITH its position — but a flat `join(" ")` scrambles multi-column reading order and
// splits `label : value` pairs. Here we use the geometry to rebuild a TRUE 2D
// CHARACTER GRID (like `pdftotext -layout`), so the emitted text REPRODUCES the
// document's page layout — a top-right recipient address renders at the top RIGHT,
// on the same lines as the left-hand letterhead, not stacked below it:
//   • reading order — group items into LINES by baseline-y proximity, top→bottom;
//   • horizontal placement — every glyph lands at its TRUE character column
//     `colOf(x)` (X mapped through the median monospace char width), so columns and
//     right-hand blocks keep their real X position — a wide gap becomes the right
//     amount of padding, not just a fixed double space. Ordinary word gaps stay ONE
//     space (clean prose); tight kerning joins with none;
//   • vertical bands — a big vertical gap emits a blank line, so paragraph/section
//     breaks survive.
// This 2D placement is what lets a remote model (and `detectAddresses`/
// `detectLabeledFields`) read a value NEXT TO its label / in its column. `runs` maps
// each character run back to its SOURCE item index so a redacted span maps to the
// item's pixel box (see `imageRedact.ts` — visual redaction of scans); `blocks`
// carries each vertical band's box/offsets (metadata).
// Values are the verbatim `item.str` slices — only ORDER + inserted whitespace change,
// so redaction stays reversible. A single-column page keeps the same clean per-line
// output as before (no over-spacing).
//
// ROTATED text (a vertical margin banner, a stamp) is QUARANTINED: its transform carries
// the rotation, and treating its (x,y) as horizontal baselines interleaves its glyphs
// into the body lines — which scrambles the reading order the detectors depend on. Each
// rotation quadrant is laid out in its OWN reading frame and emitted AFTER the main grid,
// so the body stays clean and the rotated text still reads left→right for detection.
//
// Pure (no pdf.js/DOM): the caller supplies the already-parsed items.

export interface PdfTextItem {
  str: string;
  /** pdf.js affine transform; [4]=x, [5]=y (baseline, PDF origin bottom-left). */
  transform: number[];
  width?: number;
  height?: number;
}

/** A character run in the reconstructed text → its SOURCE item (for box mapping). */
export interface LayoutRun {
  str: string;
  /** Offset of `str` in `LayoutPage.text`. */
  textStart: number;
  /** Index into the `items` array passed to `reconstructLayout`. */
  itemIndex: number;
}

/** A vertical BAND of text (lines with no big vertical gap between them), with its
 *  position + text span — metadata for a consumer that wants block regions. */
export interface LayoutBlock {
  box: { x0: number; y0: number; x1: number; y1: number };
  textStart: number;
  textEnd: number;
  /** 0-based band index (top→bottom). `col` is kept 0 (2D grid → no column split). */
  row: number;
  col: number;
}

export interface LayoutPage {
  text: string;
  runs: LayoutRun[];
  blocks: LayoutBlock[];
}

interface Glyph {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  itemIndex: number;
}

// A vertical gap larger than this (× median glyph height) emits a blank line and
// closes the current BAND. Conservative so a dense form (small gaps) stays ONE band.
const BAND_TOL = 2.2;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Group glyphs into lines (y desc = top first; new line when y drops past yTol). */
function toLines(glyphs: Glyph[], yTol: number): Glyph[][] {
  const byY = [...glyphs].sort((a, b) => b.y - a.y);
  const lines: Glyph[][] = [];
  for (const g of byY) {
    const line = lines[lines.length - 1];
    if (line && line[0].y - g.y <= yTol) line.push(g);
    else lines.push([g]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/** Rotation quadrant of an item (0 = horizontal, 1 = 90° CCW, 2 = 180°, 3 = 270°), read
 *  from the transform's rotation part. Rounded to the NEAREST quadrant, so a slightly
 *  skewed (<±45°) item stays in the normal horizontal flow. */
function rotationBucket(t: number[]): 0 | 1 | 2 | 3 {
  const q = Math.round(Math.atan2(t[1], t[0]) / (Math.PI / 2));
  return (((q % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

/** Rotate page coords by -k·90° into quadrant k's READING frame, where its text flows
 *  left→right / top→bottom again — so the same grid emitter lays it out unchanged. */
function toFrame(k: number, x: number, y: number): { x: number; y: number } {
  if (k === 1) return { x: y, y: -x };
  if (k === 2) return { x: -x, y: -y };
  if (k === 3) return { x: -y, y: x };
  return { x, y };
}

/** Inverse of {@link toFrame}: a frame-space box corner back to page space. */
function fromFrame(k: number, x: number, y: number): { x: number; y: number } {
  if (k === 1) return { x: -y, y: x };
  if (k === 2) return { x: -x, y: -y };
  if (k === 3) return { x: y, y: -x };
  return { x, y };
}

/** Map a frame-space block box back to page coordinates (so `blocks` metadata stays in
 *  the one space every consumer expects, whatever the text's rotation). */
function frameBoxToPage(k: number, b: LayoutBlock["box"]): LayoutBlock["box"] {
  const a = fromFrame(k, b.x0, b.y0);
  const c = fromFrame(k, b.x1, b.y1);
  return {
    x0: Math.min(a.x, c.x), y0: Math.min(a.y, c.y),
    x1: Math.max(a.x, c.x), y1: Math.max(a.y, c.y),
  };
}

/** Reconstruct one page as a 2D character grid: reading-order lines with every glyph
 *  placed at its true X column, plus `runs` (offset→item) and per-band `blocks`.
 *  Rotated items are laid out in their own quadrant streams AFTER the horizontal flow.
 *  `reconstructPageText` is `reconstructLayout(items).text`. */
export function reconstructLayout(items: PdfTextItem[]): LayoutPage {
  const byBucket: [Glyph[], Glyph[], Glyph[], Glyph[]] = [[], [], [], []];
  items.forEach((it, itemIndex) => {
    if (!it.str || !it.str.trim()) return; // skip spacing-only items
    const t = it.transform ?? [1, 0, 0, 1, 0, 0];
    const k = rotationBucket(t);
    // Font size lives in t[3] for horizontal text but in t[1] once rotated 90°/270°.
    const h = it.height || Math.abs(t[3]) || Math.abs(t[1]) || 10;
    const w = it.width || it.str.length * h * 0.5;
    const { x, y } = toFrame(k, t[4], t[5]);
    byBucket[k].push({ str: it.str, x, y, w, h, itemIndex });
  });

  // Main horizontal flow first, then each rotated stream (90°, 270°, 180°) — each laid
  // out in its own reading frame, appended after a blank line so it forms its own band
  // instead of interleaving with the body. Block boxes are mapped back to page space.
  const out: LayoutPage = { text: "", runs: [], blocks: [] };
  for (const k of [0, 1, 3, 2] as const) {
    if (!byBucket[k].length) continue;
    const part = layoutGlyphGrid(byBucket[k]);
    const base = out.text ? out.text.length + 2 : 0;
    if (out.text) out.text += "\n\n";
    out.text += part.text;
    for (const r of part.runs) out.runs.push({ ...r, textStart: r.textStart + base });
    const rowBase = out.blocks.length;
    for (const b of part.blocks) {
      out.blocks.push({
        ...b,
        box: frameBoxToPage(k, b.box),
        textStart: b.textStart + base,
        textEnd: b.textEnd + base,
        row: b.row + rowBase,
      });
    }
  }
  return out;
}

/** The grid emitter: lines by baseline, glyphs at their true character column. Operates
 *  on glyphs already in READING-frame coordinates (see `toFrame`). */
function layoutGlyphGrid(glyphs: Glyph[]): LayoutPage {
  if (!glyphs.length) return { text: "", runs: [], blocks: [] };

  const medianH = median(glyphs.map((g) => g.h)) || 10;
  const lines = toLines(glyphs, medianH * 0.5);

  // Map an X coordinate to a monospace CHARACTER column, so the emitted text keeps
  // the document's horizontal placement (a right-hand block lands on the right, an
  // indented block stays indented). `charW` = median per-glyph char width; `pageMinX`
  // = the left margin (column 0).
  const charW = median(glyphs.map((g) => g.w / Math.max(1, g.str.length))) || medianH * 0.5;
  const pageMinX = Math.min(...glyphs.map((g) => g.x));
  const colOf = (x: number) => Math.max(0, Math.round((x - pageMinX) / charW));

  // Emit a 2D grid: every line in top→bottom order, each glyph at its true X column.
  // A big vertical gap emits a blank line AND closes the current band (a `blocks`
  // metadata region). Lines are NOT column-split — left and right content stay on the
  // SAME line, so the page's real 2D layout is reproduced.
  const runs: LayoutRun[] = [];
  const outBlocks: LayoutBlock[] = [];
  let text = "";
  let row = 0;
  let bandStart = 0; // text offset where the current band began
  let bandGlyphs: Glyph[] = [];
  const flushBand = () => {
    if (!bandGlyphs.length) return;
    outBlocks.push({
      box: {
        x0: Math.min(...bandGlyphs.map((g) => g.x)),
        y0: Math.min(...bandGlyphs.map((g) => g.y)),
        x1: Math.max(...bandGlyphs.map((g) => g.x + g.w)),
        y1: Math.max(...bandGlyphs.map((g) => g.y + g.h)),
      },
      textStart: bandStart,
      textEnd: text.length,
      row: row++,
      col: 0,
    });
    bandGlyphs = [];
  };

  lines.forEach((line, li) => {
    if (li > 0) {
      const bigGap = lines[li - 1][0].y - line[0].y > BAND_TOL * medianH;
      text += "\n"; // terminate the previous line
      if (bigGap) {
        flushBand(); // close the band (records the block up to this \n)
        text += "\n"; // …then a blank line separates the bands
        bandStart = text.length;
      }
    }
    let col = 0; // current character column on this line
    for (let i = 0; i < line.length; i++) {
      const g = line[i];
      let pad: number;
      if (i === 0) {
        pad = Math.max(0, colOf(g.x) - col); // indent the line to its true X column
      } else {
        const prev = line[i - 1];
        const gap = g.x - (prev.x + prev.w);
        if (gap < 0.15 * g.h) pad = 0; // tight kerning → join (one word split across items)
        else if (gap < 2 * g.h) pad = 1; // an ordinary word gap → one space
        else pad = Math.max(1, colOf(g.x) - col); // column gap → pad to the true X column
      }
      text += " ".repeat(pad);
      col += pad;
      runs.push({ str: g.str, textStart: text.length, itemIndex: g.itemIndex });
      text += g.str;
      col += g.str.length;
      bandGlyphs.push(g);
    }
  });
  flushBand();
  return { text, runs, blocks: outBlocks };
}

/** Reconstruct one page's text (reading order + columns + blocks). */
export function reconstructPageText(items: PdfTextItem[]): string {
  return reconstructLayout(items).text;
}

/** Reconstruct a whole document from per-page item arrays (pages joined by \n). */
export function reconstructPdfText(pages: PdfTextItem[][]): string {
  return pages
    .map((items) => reconstructPageText(items))
    .filter((t) => t.length > 0)
    .join("\n");
}
