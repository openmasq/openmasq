/**
 * The redaction WALK: a head that travels a grid forever, redacting a block of cells in one
 * swatch while the trail clears behind it. A block reads as ONE masked value — the product's
 * own redaction reading — and it never ends, which is what makes it a loader rather than an
 * animation that plays.
 *
 * It lives here, beside `SECTION_HUE`, because two very different surfaces run it and neither
 * may disagree with the other about the swatch order or the shape of the path: the desktop
 * chat's thinking loader (`packages/ui`, a React grid) and the proxy CLI's opening sequence
 * (`apps/proxy`, blocks of ANSI). A Node CLI cannot import a React package, and a second
 * implementation of a 60-line state machine is the copy rule 9 exists to prevent.
 *
 * The walk is a CYCLE, not a line: along row 0, then column by column back through the lower
 * rows, ending one cell under the start so the last step closes the loop. The head is
 * therefore always adjacent to its previous cell, the wrap INCLUDED — a plain row-major or
 * serpentine order teleports on wrap, which reads as two disconnected redactions instead of
 * one moving mark. `walk.test.ts` pins the adjacency, wrap step included.
 */

import type { Hue } from "../types";
import { SECTION_HUE } from "./sections";

/**
 * The redaction palette's ORDER, for anything that walks it as a SEQUENCE rather than picking
 * the hue its data dictates. These are KEYS, not colours: each names a redaction SECTION whose
 * hue comes from `SECTION_HUE`, so re-toning the palette at its source reaches every surface
 * that walks it — and none of them can drift from the marks a real conversation shows.
 *
 * IDENTITY leads on purpose, then the black bar — the classic redacted-block look, the one
 * swatch that is not a section hue — then the palette unrolls in section order.
 */
export const CAV_SWATCHES = [
  "identite",
  "bar",
  "contact",
  "localisation",
  "organisation",
  "financier",
  "identifiants",
  "reseau",
  "systeme",
  "secrets",
] as const;

export type CavSwatch = (typeof CAV_SWATCHES)[number];

/**
 * The hue a swatch paints in, DERIVED from `SECTION_HUE` rather than listed again: a swatch
 * key IS its section's name, slugged. `bar` resolves to nothing on purpose — it is the classic
 * black redacted block, the one swatch that is not a section hue. A section renamed here fails
 * `walk.test.ts` instead of quietly turning a swatch colourless.
 */
export function cavHue(swatch: number): Hue | undefined {
  const key = CAV_SWATCHES[((swatch % CAV_SWATCHES.length) + CAV_SWATCHES.length) % CAV_SWATCHES.length];
  for (const [section, hue] of Object.entries(SECTION_HUE)) if (slug(section) === key) return hue;
  return undefined;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** The grid the head walks, and how much of it stays lit behind it. */
export interface WalkGrid {
  cols: number;
  rows: number;
  /** Filled cells at any instant — long enough to read as a redaction, short enough that the
   *  grid still reads as a grid (8 of 30 in the chat loader). A surface that grows its grid
   *  grows this with it, or one lit block on a wall of empty ones reads as a dead pixel. */
  trail: number;
  /** A block — one "masked value" — is 2 to 3 cells: one reads as confetti, five as a slab. */
  block?: readonly [number, number];
}

export interface WalkState {
  /** Swatch index per walk position, `null` where the trail has cleared. */
  cells: Array<number | null>;
  /** Position of the head along the walk. */
  head: number;
  /** The swatch the current block is being redacted in. */
  swatch: number;
  /** Cells still to go in the current block. */
  blockLeft: number;
}

const cellsIn = (g: WalkGrid) => g.cols * g.rows;
/** Cells in one column's leg of the return path (every row below row 0). */
const legOf = (g: WalkGrid) => g.rows - 1;

/**
 * Grid cell for a walk position. Row 0 runs left→right; the return path then takes one column
 * at a time from the right, alternating down/up, so it lands on `(0, 1)` — directly under
 * `(0, 0)`, which is what closes the cycle.
 */
export function walkCellAt(pos: number, g: WalkGrid): { col: number; row: number } {
  const total = cellsIn(g);
  const p = ((pos % total) + total) % total;
  if (p < g.cols || g.rows === 1) return { col: p % g.cols, row: 0 };
  const leg = legOf(g);
  const k = p - g.cols;
  const back = Math.floor(k / leg);
  const step = k % leg;
  return { col: g.cols - 1 - back, row: back % 2 === 0 ? 1 + step : g.rows - 1 - step };
}

/** Walk position of a grid cell — the exact inverse of {@link walkCellAt}, so a surface can
 *  render in row-major order while the redaction travels the cycle. */
export function walkPosOf(col: number, row: number, g: WalkGrid): number {
  if (row === 0) return col;
  const leg = legOf(g);
  const back = g.cols - 1 - col;
  const step = back % 2 === 0 ? row - 1 : g.rows - 1 - row;
  return g.cols + back * leg + step;
}

export function walkInitial(g: WalkGrid): WalkState {
  return { cells: Array(cellsIn(g)).fill(null), head: -1, swatch: 0, blockLeft: 0 };
}

/**
 * One tick: advance the head, redact its cell, clear the tail. `rnd` is injected so the
 * sequence is testable — a component passes `Math.random`, a test a seeded generator.
 *
 * A new block's swatch is drawn from the OTHER swatches only: two touching blocks in the same
 * colour merge into one, so the palette would look smaller than it is and a "value" would read
 * as twice its length.
 */
export function walkAdvance(
  state: WalkState,
  g: WalkGrid,
  rnd: () => number = Math.random,
): WalkState {
  const total = cellsIn(g);
  const [min, max] = g.block ?? [2, 3];
  const cells = state.cells.slice();
  const head = (state.head + 1) % total;
  let { swatch, blockLeft } = state;
  if (blockLeft <= 0) {
    if (state.head < 0) swatch = 0; // the brand indigo opens
    else swatch = (state.swatch + 1 + Math.floor(rnd() * (CAV_SWATCHES.length - 1))) % CAV_SWATCHES.length;
    blockLeft = min + Math.floor(rnd() * (max - min + 1));
  }
  cells[head] = swatch;
  blockLeft -= 1;
  // A trail as long as the grid means "leave everything lit" — a surface that closes a ring
  // asks for exactly that. Clearing `head - total` would clear the cell just lit, so the
  // whole grid would come back empty: the trail can never exceed one lap minus a cell.
  cells[(head - Math.min(g.trail, total - 1) + total) % total] = null;
  return { cells, head, swatch, blockLeft };
}

/** A settled grid — the trail, redacted, holding still. What reduced motion shows, and what a
 *  surface that draws one frame at a time asks for. */
export function walkSettled(g: WalkGrid, rnd: () => number = Math.random, steps = g.trail): WalkState {
  let s = walkInitial(g);
  for (let i = 0; i < steps; i++) s = walkAdvance(s, g, rnd);
  return s;
}
