/**
 * The app-open splash's redaction shape (see AppIntro): a random ORTHOGONAL PATH of
 * cells that fill black on the intro grid.
 *
 * It is a path, never a blob. A free random walk clusters — it revisits cells and packs
 * them into a solid patch, which reads as an ink stain rather than a redaction. Two
 * rules keep it legible: a cell is used once, and a cell that would complete a 2×2
 * filled square is refused. What is left can only be a 1-cell-wide line with right
 * angles. Pinned by `redactionShape.test.ts`.
 */

export const GRID_COLS = 18;
export const GRID_ROWS = 11;

/** Cells in the path (upper bound — a dead end ends it sooner). */
const PATH_LEN = 20;
/** Below this a trace is a stub, not a shape: re-draw it (see buildRedactionShape). */
const MIN_LEN = 12;
/** Chance of carrying straight on rather than turning: long runs, few corners. */
const STRAIGHT_BIAS = 0.72;
/** Radius of the mark's footprint, in CELLS — the HOLE the grid leaves for the logo. It
 *  drives two things at once, which is why it lives here: the path never wanders into it,
 *  and `AppIntro` draws no hairline there (`.intro-cell.is-clear`). Sized for the 68px mark
 *  over 26px cells, with clearance. */
const LOGO_CLEAR = 2.8;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** True for a cell the centred mark covers — kept clear of redaction AND of grid lines. */
export function isUnderLogo(col: number, row: number): boolean {
  return Math.hypot(col - (GRID_COLS - 1) / 2, row - (GRID_ROWS - 1) / 2) < LOGO_CLEAR;
}

const inGrid = (col: number, row: number) =>
  col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;

/**
 * Would filling (col,row) complete a 2×2 block of filled cells? Checks the four 2×2
 * squares this cell belongs to — that is exactly the local pattern that turns a path
 * into a patch.
 */
function completesBlock(filled: Set<number>, col: number, row: number): boolean {
  const isFilled = (c: number, r: number) =>
    (c === col && r === row) || (inGrid(c, r) && filled.has(r * GRID_COLS + c));
  for (const [dc, dr] of [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ] as const) {
    const c = col + dc;
    const r = row + dr;
    if (isFilled(c, r) && isFilled(c + 1, r) && isFilled(c, r + 1) && isFilled(c + 1, r + 1))
      return true;
  }
  return false;
}

/** A cell may join the path: on the grid, clear of the mark, unused, and not a blob. */
function canFill(filled: Set<number>, col: number, row: number): boolean {
  if (!inGrid(col, row) || isUnderLogo(col, row)) return false;
  if (filled.has(row * GRID_COLS + col)) return false;
  return !completesBlock(filled, col, row);
}

/** Fisher-Yates over a copy — the fallback order when the current heading is blocked. */
function shuffledDirs(): Array<readonly [number, number]> {
  const d = [...DIRS];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** One attempt from a random seed cell. Self-avoidance means it can trap itself early. */
function tracePath(): Map<number, number> {
  const order = new Map<number, number>();
  const filled = new Set<number>();

  // Start off-centre, and off the border so the first turn has room either way.
  let col = 0;
  let row = 0;
  for (let tries = 0; tries < 40; tries++) {
    col = 1 + Math.floor(Math.random() * (GRID_COLS - 2));
    row = 1 + Math.floor(Math.random() * (GRID_ROWS - 2));
    if (!isUnderLogo(col, row)) break;
  }
  if (!canFill(filled, col, row)) return order;

  let [dc, dr] = DIRS[Math.floor(Math.random() * DIRS.length)];
  for (let step = 0; step < PATH_LEN; step++) {
    filled.add(row * GRID_COLS + col);
    order.set(row * GRID_COLS + col, order.size);

    // Carry on straight when we can and the bias says so; otherwise turn (or, at a dead
    // end, take whatever direction is still legal — none ⇒ the path stops here).
    const straightOk = canFill(filled, col + dc, row + dr);
    let next: readonly [number, number] | undefined =
      straightOk && Math.random() < STRAIGHT_BIAS ? [dc, dr] : undefined;
    if (!next) {
      next = shuffledDirs().find(
        ([nc, nr]) => !(nc === -dc && nr === -dr) && canFill(filled, col + nc, row + nr),
      );
    }
    if (!next && straightOk) next = [dc, dr];
    if (!next) break;

    [dc, dr] = next;
    col += dc;
    row += dr;
  }
  return order;
}

/**
 * Builds one shape → `{cellIndex: fillOrder}`; the order drives the staggered fill-in,
 * so the black cells appear along the path rather than all at once.
 *
 * A self-avoiding path can box itself in after a few cells; a stub of 5 cells reads as a
 * smudge, not a redaction, so a short trace is re-drawn from a new seed and the longest
 * attempt wins. Bounded retries — this runs on the app-open frame.
 */
export function buildRedactionShape(): Map<number, number> {
  let best = new Map<number, number>();
  for (let attempt = 0; attempt < 12; attempt++) {
    const path = tracePath();
    if (path.size > best.size) best = path;
    if (best.size >= MIN_LEN) break;
  }
  return best;
}

/**
 * One palette swatch per STRAIGHT RUN of the path: the colour holds along a segment and
 * changes at every corner, so the trace reads as a series of redacted VALUES rather than
 * one long smear.
 *
 * ⚠️ RECONSTRUCTED. The original was lost with an uncommitted edit; this restores the
 * contract its two witnesses agree on — the call site (`Map<cellIndex, swatchIndex>`, read
 * with `?? 0`) and the rule its sibling `miniRedactionWalk` states for the same palette:
 * a new run never repeats the previous swatch, because two touching runs in one colour
 * merge into a single over-long block. Swatch 0 (the brand indigo) opens, as in `palette.ts`.
 *
 * `rnd` is injected so the sequence is testable; the component passes `Math.random`.
 */
export function assignSwatches(
  path: Map<number, number>,
  count: number,
  rnd: () => number = Math.random,
): Map<number, number> {
  const out = new Map<number, number>();
  if (count <= 0) return out;
  // Walk in FILL order — the path's own sequence, not the cell-index order.
  const cells = [...path.entries()].sort((a, b) => a[1] - b[1]).map(([cell]) => cell);
  let swatch = 0;
  let heading: string | null = null;
  for (let i = 0; i < cells.length; i++) {
    if (i > 0) {
      const prev = cells[i - 1];
      const cur = cells[i];
      const dir = `${(cur % GRID_COLS) - (prev % GRID_COLS)},${Math.floor(cur / GRID_COLS) - Math.floor(prev / GRID_COLS)}`;
      if (heading !== null && dir !== heading && count > 1) {
        // A corner starts a new run: pick from the OTHER swatches only.
        swatch = (swatch + 1 + Math.floor(rnd() * (count - 1))) % count;
      }
      heading = dir;
    }
    out.set(cells[i], swatch);
  }
  return out;
}
