// OOXML measurement units. Every one of these is a bare integer in the XML, so a
// wrong conversion is silent — the document renders, just wrong. Hence one named
// function per unit and a test per trap, rather than magic numbers at call sites.
//
// ⚠️ THE trap: font size is spelled almost identically in the two formats and means
// something different by a factor of 2.
//   docx  <w:sz w:val="24"/>   → HALF-points        → 12pt
//   pptx  <a:rPr sz="2400"/>   → HUNDREDTHS of a pt → 24pt
// Same concept, twin spelling, different unit. `units.test.ts` pins both.

/** English Metric Units per inch — the DrawingML/pptx coordinate base. */
const EMU_PER_INCH = 914400;
/** EMU per point (72 pt = 1 inch). */
const EMU_PER_POINT = 12700;
/** CSS reference pixels per inch. */
const PX_PER_INCH = 96;

/** EMU → CSS px. Shape offsets/extents (`<a:off x=/>`, `<a:ext cx=/>`) and slide
 *  size (`<p:sldSz cx=/>`) are all EMU. */
export function emuToPx(emu: number): number {
  return (emu / EMU_PER_INCH) * PX_PER_INCH;
}

/** EMU → points. */
export function emuToPt(emu: number): number {
  return emu / EMU_PER_POINT;
}

/** docx `<w:sz w:val>` / `<w:spacing>`: HALF-points → points. */
export function halfPointsToPt(v: number): number {
  return v / 2;
}

/** pptx `<a:rPr sz>`: HUNDREDTHS of a point → points. */
export function hundredthsToPt(v: number): number {
  return v / 100;
}

/** docx twips (twentieths of a point) → points. Indents, margins, `<w:spacing>`
 *  before/after are twips even though `<w:sz>` next to them is half-points. */
export function twipsToPt(v: number): number {
  return v / 20;
}

/** docx twips → CSS px. */
export function twipsToPx(v: number): number {
  return (twipsToPt(v) / 72) * PX_PER_INCH;
}

/** Percentages in DrawingML are thousandths of a percent: `val="60000"` = 60%.
 *  Used by the colour modifiers (`<a:lumMod val="60000"/>`). Returns a 0–1 ratio. */
export function pctToRatio(v: number): number {
  return v / 100000;
}
