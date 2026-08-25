import { CAV_SWATCHES } from "./palette";

/**
 * The mini redaction loader's pure state machine (see `MiniRedaction.tsx`): a HEAD that
 * walks a small grid forever, redacting a block of cells in one random swatch, while the
 * trail clears behind it. A block of cells reads as ONE masked value — the product's own
 * redaction reading — and it never ends, which is what makes it a loader.
 *
 * The walk is a CYCLE, not a line: along row 0, then column by column back through the lower
 * rows, ending one cell under the start so the last step closes the loop. So the head is
 * always adjacent to its previous cell, the wrap INCLUDED — a plain row-major or serpentine
 * order teleports on wrap, which reads as two disconnected redactions instead of one moving
 * mark. `miniRedaction.test.ts` pins the adjacency, wrap step included.
 */

export const MINI_COLS = 10;
export const MINI_ROWS = 3;
const CELLS = MINI_COLS * MINI_ROWS;
/** Cells in one column's leg of the return path (every row below row 0). */
const LEG = MINI_ROWS - 1;

/** Filled cells at any instant — long enough to read as a redaction, short enough to keep
 *  the grid legible as a grid (8 of 30). */
export const MINI_TRAIL = 8;
/** A block (one "masked value") is 2-3 cells: one reads as confetti, five as a slab. */
const MIN_BLOCK = 2;
const MAX_BLOCK = 3;

export interface MiniState {
  /** Swatch index per walk position, `null` where the trail has cleared. */
  cells: Array<number | null>;
  /** Position of the head along the walk. */
  head: number;
  /** The swatch the current block is being redacted in. */
  swatch: number;
  /** Cells still to go in the current block. */
  blockLeft: number;
}

/**
 * Grid cell for a walk position. Row 0 runs left→right; the return path then takes one column
 * at a time from the right, alternating down/up, so it lands on `(0, 1)` — directly under
 * `(0, 0)`, which is what closes the cycle.
 */
export function miniCellAt(pos: number): { col: number; row: number } {
  const p = ((pos % CELLS) + CELLS) % CELLS;
  if (p < MINI_COLS) return { col: p, row: 0 };
  const k = p - MINI_COLS;
  const leg = Math.floor(k / LEG);
  const step = k % LEG;
  return {
    col: MINI_COLS - 1 - leg,
    row: leg % 2 === 0 ? 1 + step : MINI_ROWS - 1 - step,
  };
}

/** Walk position of a grid cell — the exact inverse of {@link miniCellAt}, so the component
 *  can render in row-major DOM order while the redaction travels the cycle. */
export function miniPosOf(col: number, row: number): number {
  if (row === 0) return col;
  const leg = MINI_COLS - 1 - col;
  const step = leg % 2 === 0 ? row - 1 : MINI_ROWS - 1 - row;
  return MINI_COLS + leg * LEG + step;
}

export function miniInitial(): MiniState {
  return { cells: Array(CELLS).fill(null), head: -1, swatch: 0, blockLeft: 0 };
}

/**
 * One tick: advance the head, redacted its cell, clear the tail. `rnd` is injected so the
 * sequence is testable — the component passes `Math.random`.
 *
 * A new block's swatch is drawn from the OTHER swatches only: two touching blocks in the same
 * colour merge into one, so the palette would look smaller than it is and a "value" would
 * read as twice its length.
 */
export function miniAdvance(state: MiniState, rnd: () => number = Math.random): MiniState {
  const cells = state.cells.slice();
  const head = (state.head + 1) % CELLS;
  let { swatch, blockLeft } = state;
  if (blockLeft <= 0) {
    if (state.head < 0) {
      swatch = 0; // the brand indigo opens (palette.ts)
    } else {
      const pick = Math.floor(rnd() * (CAV_SWATCHES.length - 1));
      swatch = (state.swatch + 1 + pick) % CAV_SWATCHES.length;
    }
    blockLeft = MIN_BLOCK + Math.floor(rnd() * (MAX_BLOCK - MIN_BLOCK + 1));
  }
  cells[head] = swatch;
  blockLeft -= 1;
  cells[(head - MINI_TRAIL + CELLS) % CELLS] = null;
  return { cells, head, swatch, blockLeft };
}

/** A settled grid for reduced motion: the trail, redacted, holding still. */
export function miniSettled(rnd: () => number = Math.random): MiniState {
  let s = miniInitial();
  for (let i = 0; i < MINI_TRAIL; i++) s = miniAdvance(s, rnd);
  return s;
}
