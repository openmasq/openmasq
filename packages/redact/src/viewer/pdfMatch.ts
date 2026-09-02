// The PURE matching/correlation half of the PDF-redaction viewer (`pdfRedact.ts` is
// the canvas painter, `pdfDerive.ts` derives the real→fake map; the
// `@openmasq/redact/pdf-redact` subpath re-exports all three). DOM-free and
// unit-tested: correlating each value with the pdf.js text items it spans —
// including a value SPLIT ACROSS ITEMS or spaced differently by the 2D layout grid
// (`layoutValueHits`), which per-item substring matching can never find — and the
// per-value coverage proof (`paintCoversReplacements`) gating every surface that
// ships the painted pixels.
import { isWordGlued, escapeRegExp } from "../util";
import type { LayoutPage, LayoutRun } from "../documents/pdfLayout";
import { ocrWordsToLayout, type OcrWord } from "../ocr/layout";

/** A sensitive value, its believable fake, and the highlight tone for its kind. */
export interface PdfReplacement {
  real: string;
  fake: string;
  tone: string; // coral | blue | violet | emerald | amber | mint
  /** The FINE category (name/email/…) — drives the tone AND the hover type chip.
   *  Optional so old callers/serialised maps still parse (the chip just omits). */
  kind?: string;
}

/**
 * The reveal-skips-paint core (pure, unit-tested): for one text item's `hits`
 * (replacements it contains, longest-first) and the user's `reveal` set of REAL
 * values kept in clear, decide which values must still be faked/painted (`active`),
 * the primary value (`hits[0]`, the box's reveal key), and whether that primary is
 * revealed. An EMPTY `active` ⇒ paint nothing (original glyphs stay visible).
 */
export function resolveBoxReveal(
  hits: PdfReplacement[],
  reveal?: ReadonlySet<string>,
): { active: PdfReplacement[]; primary: PdfReplacement; revealed: boolean } {
  const primary = hits[0];
  const active = reveal ? hits.filter((r) => !reveal.has(r.real)) : hits;
  return { active, primary, revealed: !!reveal?.has(primary.real) };
}

/** One redacted value's occurrence inside a text string (`imageRedact.ts` boxes). */
export interface ValueRange {
  start: number;
  end: number;
  rep: PdfReplacement;
}

/**
 * The STANDALONE occurrence ranges of each replacement in `str`, LONGEST value first
 * with overlaps removed and sorted by start — the OCR path's box source
 * (`imageRedact.ts` maps each range to its word boxes). Whitespace-FLEXIBLE like
 * `layoutValueHits` (a single-spaced vault value still matches padded OCR layout).
 */
export function valueBoxRanges(str: string, active: PdfReplacement[]): ValueRange[] {
  const taken = new Array<boolean>(str.length).fill(false);
  const out: ValueRange[] = [];
  for (const rep of [...active].sort((a, b) => b.real.length - a.real.length)) {
    if (!rep.real) continue;
    const re = flexibleValueRegex(rep.real);
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
      if (isWordGlued(str, s, m[0])) continue; // glued inside a word → not a real span
      let overlap = false;
      for (let i = s; i < e; i++)
        if (taken[i]) {
          overlap = true;
          break;
        }
      if (overlap) continue; // a shorter value inside a longer one already painted
      for (let i = s; i < e; i++) taken[i] = true;
      out.push({ start: s, end: e, rep });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** One redacted value's slice WITHIN one pdf.js text item (`start`/`end` index into
 *  that item's `str`) — the unit the painter draws one box for. */
export interface LayoutSegment {
  itemIndex: number;
  start: number;
  end: number;
}

/** One occurrence of a replacement on a page: the per-item segments it spans. */
export interface LayoutValueHit {
  rep: PdfReplacement;
  segments: LayoutSegment[];
}

/** Whitespace-FLEXIBLE matcher for `real`: the 2D layout grid inserts padding
 *  (column spaces, line breaks) that per-item strings don't carry, and a vault value
 *  may be single-spaced where the grid is padded — so every whitespace run in the
 *  value matches ANY whitespace run (`\s+`, newlines included). */
function flexibleValueRegex(real: string): RegExp {
  return new RegExp(escapeRegExp(real).replace(/\s+/g, "\\s+"), "g");
}

/** Whether `value` occurs in `text` at all — whitespace-flexible AND case-insensitive.
 *  Backs the «zone image» note: a canvas word run absent from the PRIMARY text is
 *  image-baked (logo/scan), i.e. NOT part of the text sent to the model. */
export function occursFlexibly(text: string, value: string): boolean {
  if (!text || !value) return false;
  return new RegExp(escapeRegExp(value).replace(/\s+/g, "\\s+"), "iu").test(text);
}

/**
 * Correlate each replacement with the pdf.js text items it spans, by matching on the
 * RECONSTRUCTED page text (`reconstructLayout`) and mapping every occurrence back to
 * per-item sub-ranges through `runs` — the same offset→item mechanism `imageRedact.ts`
 * uses for OCR scans. This is what lets the painter cover a value SPLIT ACROSS ITEMS
 * ("52 impasse des Roses," + "64000 PAU"), which per-item matching silently dropped.
 *
 * Returns the paintable `hits` (longest value first, overlaps removed — one box set
 * per occurrence) and `covered`: every real value ACCOUNTED FOR by this page's paint,
 * i.e. it got its own hit or every char of its occurrence lies under a longer painted
 * value. `covered` is the per-value input to the send gate (`paintCoversReplacements`):
 * an expected value on NO page's covered set means its pixels are NOT painted.
 */
export function layoutValueHits(
  layout: Pick<LayoutPage, "text" | "runs">,
  active: PdfReplacement[],
): { hits: LayoutValueHit[]; covered: Set<string> } {
  const taken = new Array<boolean>(layout.text.length).fill(false);
  const hits: LayoutValueHit[] = [];
  const covered = new Set<string>();
  for (const rep of [...active].sort((a, b) => b.real.length - a.real.length)) {
    if (!rep.real) continue;
    const re = flexibleValueRegex(rep.real);
    let m: RegExpExecArray | null;
    while ((m = re.exec(layout.text)) !== null) {
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
      const s = m.index;
      const e = s + m[0].length;
      // Glued inside a larger word (a short real like "PAU" in "PAULINE") → not a span.
      if (isWordGlued(layout.text, s, m[0])) continue;
      let takenCount = 0;
      for (let i = s; i < e; i++) if (taken[i]) takenCount++;
      if (takenCount === e - s) {
        covered.add(rep.real); // fully under a longer painted value → pixels covered
        continue;
      }
      if (takenCount > 0) continue; // PARTIAL overlap: unpaintable cleanly → NOT covered
      for (let i = s; i < e; i++) taken[i] = true;
      covered.add(rep.real);
      const segments: LayoutSegment[] = [];
      for (const run of layout.runs) {
        const rs = run.textStart;
        const os = Math.max(s, rs);
        const oe = Math.min(e, rs + run.str.length);
        // Skip inter-item padding (chars between runs) and whitespace-only clips.
        if (oe > os && run.str.slice(os - rs, oe - rs).trim())
          segments.push({ itemIndex: run.itemIndex, start: os - rs, end: oe - rs });
      }
      if (segments.length) hits.push({ rep, segments });
    }
  }
  return { hits, covered };
}

/**
 * Audit H2 — the fail-closed PER-VALUE proof gating every "ship the painted pages"
 * surface (the extension's native upload `scrubFile.ts`; the desktop no longer ships
 * painted pages). Every expected (non-revealed) replacement must appear in some
 * page's `covered` set — `renderRedactedPdf` marks a value covered only when its
 * pixels were painted (own box, or fully subsumed under a longer painted value).
 * Refuses (→ the caller falls back to the redacted TEXT path) when:
 *  - `painted === 0` with redactions pending — a SCANNED PDF (no text layer,
 *    nothing painted, raw pixels would ship as "redacted");
 *  - ANY expected value is covered on NO page — detected from this document (an
 *    OCR-layer stamp, a scan page of a mixed PDF, a page past the render cap, a
 *    matcher regression) yet its pixels are NOT painted. A `painted > 0` floor
 *    would bless the whole doc off one painted box and ship exactly those.
 *
 * ⚠️ Caller contract: `replacements` must be THIS document's own drop-time map —
 * every entry originated in this document, so "covered nowhere" is proof of a
 * hole, never a benign absence. A whole-conversation vault here would false-close
 * on typed-only values. Residual (detection-bound): pixel PII the detector never
 * found has no replacement, so no gate can see it — same bound as the text path.
 */
export function paintCoversReplacements(
  pages: { boxes: { real: string; revealed: boolean }[]; covered?: ReadonlySet<string> }[],
  replacements: PdfReplacement[],
  reveal?: ReadonlySet<string>,
): boolean {
  const expected = replacements.filter((r) => r.real && !(reveal && reveal.has(r.real)));
  if (expected.length === 0) return true; // nothing to redact → nothing to prove
  const painted = pages.reduce((n, pg) => n + pg.boxes.filter((b) => !b.revealed).length, 0);
  if (painted === 0) return false; // scan floor: redactions pending, nothing painted
  // Per-VALUE: a page must account for each expected value (pages without a
  // `covered` set — a legacy/partial caller — account for nothing: fail closed).
  return expected.every((r) => pages.some((pg) => pg.covered?.has(r.real)));
}


/** A redacted region in canvas px. Carries the primary redacted VALUE in the region
 *  (`real`) + its `fake`/`tone`, so a consumer can render a click-to-reveal affordance
 *  and key the reveal on the real value. `revealed` = currently kept in clear. */
export interface RedactBox {
  left: number;
  top: number;
  w: number;
  h: number;
  /** The text this box covers (context / hover tooltip). */
  original: string;
  /** The primary redacted value in this box — the key for the reveal set. */
  real: string;
  /** Its believable fake (what the model/site sees when NOT revealed). */
  fake: string;
  /** Highlight tone for its kind (coral | blue | violet | emerald | amber | mint). */
  tone: string;
  /** The FINE category of `real` (name/email/…) — for the hover type chip. */
  kind?: string;
  /** True when `real` is in the reveal set → painted with the ORIGINAL glyphs. */
  revealed: boolean;
}

/**
 * PURE core: map each redacted value's STANDALONE occurrence in `text` to a tight
 * pixel box, by UNIONING the boxes of the OCR words it covers. `runs` (offset→word
 * index, from `ocrWordsToLayout`) + `boxes[run.itemIndex]` (the word's ORIGINAL px
 * box) do the mapping — a multi-word value ("35136 Saint-Jacques") unions several
 * word boxes into one rectangle. `reveal` = REAL values kept in clear (box emitted
 * `revealed:true`; the painter skips it). Reuses `valueBoxRanges` (standalone,
 * longest-first, no overlap, no word-glue). Deterministic, DOM-free, unit-tested.
 */
export function matchValueToBoxes(
  replacements: PdfReplacement[],
  text: string,
  runs: LayoutRun[],
  boxes: { x0: number; y0: number; x1: number; y1: number }[],
  reveal?: ReadonlySet<string>,
): RedactBox[] {
  const out: RedactBox[] = [];
  for (const { start, end, rep } of valueBoxRanges(text, replacements)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of runs) {
      const rs = r.textStart;
      const re = rs + r.str.length;
      if (re <= start || rs >= end) continue; // this word doesn't overlap the value
      const b = boxes[r.itemIndex];
      if (!b) continue;
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
    }
    if (!Number.isFinite(x0)) continue; // no source word found (defensive)
    const { revealed } = resolveBoxReveal([rep], reveal);
    out.push({
      left: x0, top: y0, w: x1 - x0, h: y1 - y0,
      original: text.slice(start, end), real: rep.real, fake: rep.fake, tone: rep.tone,
      kind: rep.kind, revealed,
    });
  }
  return out;
}

/**
 * The SCANNED-page fallback of the PDF painter (pure half): correlate the values the
 * TEXT layer could not cover on this page against the page's OCR WORD BOXES — the
 * geometry the extraction already produced (`ExtractedFile.ocrPages`) — and scale the
 * resulting boxes from OCR raster px into the painter's canvas px (`sx`/`sy`). A
 * scanned page has NO pdf.js text items, so without this the viewer showed the raw
 * scan with ZERO redaction boxes even though OCR succeeded and the values were
 * vaulted. Values already covered by the text layer are skipped (a mixed page would
 * otherwise get double boxes); `covered` reports what the OCR paint accounts for, so
 * the per-value ship gate (`paintCoversReplacements`) can accept a painted scan.
 */
export function ocrFallbackBoxes(
  replacements: PdfReplacement[],
  alreadyCovered: ReadonlySet<string>,
  page: { words: OcrWord[]; width: number; height: number },
  sx: number,
  sy: number,
  reveal?: ReadonlySet<string>,
): { boxes: RedactBox[]; covered: ReadonlySet<string> } {
  const pending = replacements.filter((r) => !alreadyCovered.has(r.real));
  if (!pending.length || !page.words?.length) return { boxes: [], covered: new Set() };
  // Same default confidence floor as the extraction → the run↔box mapping matches
  // the text that was redacted (see `renderRedactedImage`'s note).
  const { text, runs, words } = ocrWordsToLayout(page.words);
  const raw = matchValueToBoxes(
    pending,
    text,
    runs,
    words.map((w) => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 })),
    reveal,
  );
  const boxes = raw.map((b) => ({ ...b, left: b.left * sx, top: b.top * sy, w: b.w * sx, h: b.h * sy }));
  return { boxes, covered: new Set(boxes.map((b) => b.real)) };
}
