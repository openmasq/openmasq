// The desktop chat's thinking loader, laid around the logo: the same head, the same blocks of
// two or three cells in one section hue, the same trail clearing behind — running the border
// of a box instead of a small rectangle.
//
// The WALK is the app's own, imported from `@openmasq/redact` and never re-implemented (rule
// 9). A ring is that walk on a one-row grid whose positions are mapped to border cells: the
// path stays a cycle, so the mark is always adjacent to where it just was, the wrap included.
//
// This is where the palette belongs. Nine hues travelling a ring around a name read as the
// product's own loader; the same nine spread over a whole screen read as noise, which is what
// the first version of this sequence did.
import { cavHue, walkAdvance, walkInitial, type WalkState } from "@openmasq/redact";
import { HUE_HEX, INK_HEX } from "./palette.js";
import type { Tty } from "./tty.js";

/** A cell is two columns where there is room: a terminal cell is about twice as tall as it is
 *  wide, so two columns is what reads as a square block. A narrow terminal gets one, which
 *  halves the whole composition rather than dropping the drawn name — condensed letters beat
 *  no letters, and the brand's own display face is condensed. */
export const CELL_W = 2;
export const CELL_W_NARROW = 1;

export interface RingBox {
  /** Cells, the border included. */
  cols: number;
  rows: number;
}

/** The border cells, clockwise from the top-left — the order the head travels. */
export function ringPath(box: RingBox): Array<{ col: number; row: number }> {
  const { cols, rows } = box;
  const path: Array<{ col: number; row: number }> = [];
  for (let c = 0; c < cols; c++) path.push({ col: c, row: 0 });
  for (let r = 1; r < rows; r++) path.push({ col: cols - 1, row: r });
  for (let c = cols - 2; c >= 0; c--) path.push({ col: c, row: rows - 1 });
  for (let r = rows - 2; r >= 1; r--) path.push({ col: 0, row: r });
  return path;
}

/** The walk's state after `ticks`, on a ring of `length` cells. Rebuilt per frame: a state
 *  belongs to one grid, and the trail grows as the sequence closes. */
export function ringAt(length: number, trail: number, ticks: number, rnd: () => number): WalkState {
  const grid = { cols: length, rows: 1, trail };
  let s = walkInitial(grid);
  for (let i = 0; i < ticks; i++) s = walkAdvance(s, grid, rnd);
  return s;
}

/** Hue per lit border cell, `col,row` keyed — `undefined` where the trail has cleared. */
export function ringHues(box: RingBox, state: WalkState): Map<string, string> {
  const lit = new Map<string, string>();
  ringPath(box).forEach((cell, i) => {
    const swatch = state.cells[i];
    if (swatch === null || swatch === undefined) return;
    const hue = cavHue(swatch);
    lit.set(`${cell.col},${cell.row}`, hue ? HUE_HEX[hue] : INK_HEX);
  });
  return lit;
}

/** A block of `w` columns in `hex`, or the same width of nothing. */
export function cell(tty: Tty, hex: string | undefined, w: number): string {
  return hex ? tty.fill(hex, INK_HEX, w, () => "") : " ".repeat(w);
}

/** A seeded generator: an opening that looked different on every run would be a different
 *  opening, and a test could not read it. */
export function seeded(seed = 1): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}
