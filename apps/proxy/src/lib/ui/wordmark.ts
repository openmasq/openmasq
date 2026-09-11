// OPENMASQ, drawn on the field's own grid — five rows of cells, so the name appears IN the
// redaction rather than on top of it. It is the one thing in the opening sequence that is
// allowed the brand colour: the field around it stays neutral, because a hue there would
// carry no meaning, and the panel's hues do (one per category).
//
// A bitmap rather than a figlet font: eight glyphs are all this needs, and a font file would
// be an asset to load for a screen that lasts a second and a half. Seven rows with two-cell
// horizontals — the letters carry the screen, so they are the tallest thing the ring can hold;
// the WIDTH is fixed by the terminal (eight letters at two columns a cell), which is why they
// grew upwards.
const GLYPHS: Record<string, string[]> = {
  O: ["1111", "1111", "1..1", "1..1", "1..1", "1111", "1111"],
  P: ["1111", "1111", "1..1", "1111", "1111", "1...", "1..."],
  E: ["1111", "1111", "1...", "111.", "111.", "1111", "1111"],
  N: ["1..1", "11.1", "11.1", "1.11", "1.11", "1..1", "1..1"],
  M: ["1...1", "11.11", "11.11", "1.1.1", "1...1", "1...1", "1...1"],
  A: [".11.", "1111", "1..1", "1111", "1111", "1..1", "1..1"],
  S: [".111", "1111", "1...", ".11.", "...1", "1111", "111."],
  Q: [".11.", "1111", "1..1", "1..1", "1.11", "1111", "..11"],
};

const WORD = "OPENMASQ";
export const WORDMARK_ROWS = 7;

/** Cells wide, gaps included. Below this the grid gets the plain word instead. */
export const WORDMARK_COLS = [...WORD].reduce(
  (n, ch, i) => n + (GLYPHS[ch]?.[0]?.length ?? 0) + (i ? 1 : 0),
  0,
);

/** `col,row` of every lit cell, relative to the wordmark's own box. `reveal` (0 to 1) walks
 *  it left to right, so the name is written as the field grows rather than switched on. */
export function wordmarkCells(reveal = 1): Set<string> {
  const lit = new Set<string>();
  const upTo = Math.round(WORDMARK_COLS * Math.min(1, Math.max(0, reveal)));
  let x = 0;
  for (const ch of WORD) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    glyph.forEach((line, row) =>
      [...line].forEach((px, col) => {
        if (px === "1" && x + col < upTo) lit.add(`${x + col},${row}`);
      }),
    );
    x += (glyph[0]?.length ?? 0) + 1;
  }
  return lit;
}
