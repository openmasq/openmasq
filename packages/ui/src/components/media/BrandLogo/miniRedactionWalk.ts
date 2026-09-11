// The mini redaction loader's state machine (see `MiniRedaction.tsx`). The WALK itself lives
// in `@openmasq/redact` (`highlight/walk.ts`): the proxy CLI's opening sequence runs the same
// path in a terminal, and a Node CLI cannot import this React package — one home, two
// surfaces, rule 9. What stays here is this surface's own GRID: ten by three, a trail of
// eight, which is what a loader beside a line of text can be without becoming a wall.
import { walkAdvance, walkCellAt, walkInitial, walkPosOf, walkSettled } from "@openmasq/redact";
import type { WalkGrid, WalkState } from "@openmasq/redact";

export type { WalkState as MiniState };

export const MINI_COLS = 10;
export const MINI_ROWS = 3;
/** Filled cells at any instant — long enough to read as a redaction, short enough to keep the
 *  grid legible as a grid (8 of 30). */
export const MINI_TRAIL = 8;

const GRID: WalkGrid = { cols: MINI_COLS, rows: MINI_ROWS, trail: MINI_TRAIL };

export const miniCellAt = (pos: number) => walkCellAt(pos, GRID);
export const miniPosOf = (col: number, row: number) => walkPosOf(col, row, GRID);
export const miniInitial = () => walkInitial(GRID);
export const miniAdvance = (state: WalkState, rnd: () => number = Math.random) =>
  walkAdvance(state, GRID, rnd);
export const miniSettled = (rnd: () => number = Math.random) => walkSettled(GRID, rnd);
