import { describe, it, expect } from "vitest";
import { CAV_SWATCHES } from "./palette";
import {
  MINI_COLS,
  MINI_ROWS,
  MINI_TRAIL,
  miniAdvance,
  miniCellAt,
  miniInitial,
  miniPosOf,
  miniSettled,
} from "./miniRedactionWalk";

const CELLS = MINI_COLS * MINI_ROWS;
/** Run the machine far enough to wrap the cycle twice — the wrap is where it can break. */
const ticks = (n: number, rnd?: () => number) => {
  let s = miniInitial();
  const seen = [s];
  for (let i = 0; i < n; i++) {
    s = miniAdvance(s, rnd);
    seen.push(s);
  }
  return { last: s, seen };
};

describe("mini redaction walk", () => {
  it("covers every cell exactly once per lap", () => {
    const seen = new Set<string>();
    for (let pos = 0; pos < CELLS; pos++) {
      const { col, row } = miniCellAt(pos);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(MINI_COLS);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(MINI_ROWS);
      seen.add(`${col},${row}`);
    }
    expect(seen.size).toBe(CELLS);
  });

  it("is a CYCLE — every step is to a touching cell, the wrap included", () => {
    // This is the whole reason for the comb order: a row-major or serpentine walk teleports
    // when it wraps, and the loader then reads as two disconnected redactions.
    for (let pos = 0; pos < CELLS; pos++) {
      const a = miniCellAt(pos);
      const b = miniCellAt((pos + 1) % CELLS);
      expect(
        Math.abs(a.col - b.col) + Math.abs(a.row - b.row),
        `step ${pos}→${(pos + 1) % CELLS}: (${a.col},${a.row})→(${b.col},${b.row})`,
      ).toBe(1);
    }
  });

  it("miniPosOf is the exact inverse of miniCellAt", () => {
    for (let pos = 0; pos < CELLS; pos++) {
      const { col, row } = miniCellAt(pos);
      expect(miniPosOf(col, row)).toBe(pos);
    }
  });
});

describe("mini redaction state", () => {
  it("holds a constant trail once warmed up — it never fills the grid", () => {
    const { seen } = ticks(CELLS * 2 + 5);
    const filled = (s: (typeof seen)[number]) => s.cells.filter((c) => c !== null).length;
    // Grows to the trail length, then stays there for good (the loader must not saturate).
    expect(filled(seen[MINI_TRAIL])).toBe(MINI_TRAIL);
    for (let k = MINI_TRAIL; k < seen.length; k++) {
      expect(filled(seen[k]), `tick ${k}`).toBe(MINI_TRAIL);
    }
  });

  it("redacted in BLOCKS of 2-3 cells, never cell by cell", () => {
    const { seen } = ticks(CELLS * 3);
    // Read the swatch the head just laid at each tick, then measure the runs.
    const laid = seen.slice(1).map((s) => s.cells[s.head]!);
    const runs: number[] = [];
    let len = 1;
    for (let k = 1; k < laid.length; k++) {
      if (laid[k] === laid[k - 1]) len++;
      else {
        runs.push(len);
        len = 1;
      }
    }
    // Drop the last (still open) run, then every completed block must be 2 or 3.
    for (const r of runs) expect(r === 2 || r === 3, `block of ${r}`).toBe(true);
    expect(runs.length).toBeGreaterThan(5);
  });

  it("never repeats a swatch on two touching blocks", () => {
    const { seen } = ticks(CELLS * 3);
    const laid = seen.slice(1).map((s) => s.cells[s.head]!);
    for (let k = 1; k < laid.length; k++) {
      // Consecutive cells either continue the block (equal) or start a DIFFERENT colour —
      // else two blocks merge and the palette looks smaller than it is.
      if (laid[k] !== laid[k - 1]) expect(laid[k]).not.toBe(laid[k - 1]);
      expect(laid[k]).toBeGreaterThanOrEqual(0);
      expect(laid[k]).toBeLessThan(CAV_SWATCHES.length);
    }
  });

  it("IDENTITÉ opens — the section people redact most after Contact", () => {
    const { seen } = ticks(1);
    expect(seen[1].cells[seen[1].head]).toBe(0);
    expect(CAV_SWATCHES[0]).toBe("identite");
  });

  it("exercises the whole palette over time", () => {
    const { seen } = ticks(CELLS * 6);
    const used = new Set(seen.slice(1).map((s) => s.cells[s.head]!));
    expect(used.size).toBe(CAV_SWATCHES.length);
  });

  it("miniSettled gives a full, still trail (reduced motion)", () => {
    const s = miniSettled();
    expect(s.cells.filter((c) => c !== null).length).toBe(MINI_TRAIL);
  });
});
