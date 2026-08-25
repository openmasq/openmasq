import { describe, it, expect } from "vitest";
import {
  GRID_COLS,
  GRID_ROWS,
  assignSwatches,
  buildRedactionShape,
  isUnderLogo,
} from "./redactionShape";

/** 200 real (unseeded) draws — the invariants must hold for EVERY shape the splash can
 *  produce, not for one lucky seed. */
const SHAPES = Array.from({ length: 200 }, () => buildRedactionShape());
const cellsOf = (shape: Map<number, number>) =>
  [...shape.keys()].map((i) => ({ col: i % GRID_COLS, row: Math.floor(i / GRID_COLS) }));

describe("redaction shape", () => {
  it("never fills a 2×2 block — a path, never a pâté", () => {
    for (const shape of SHAPES) {
      const filled = new Set(shape.keys());
      const has = (c: number, r: number) => filled.has(r * GRID_COLS + c);
      for (let r = 0; r < GRID_ROWS - 1; r++) {
        for (let c = 0; c < GRID_COLS - 1; c++) {
          const block = has(c, r) && has(c + 1, r) && has(c, r + 1) && has(c + 1, r + 1);
          expect(block, `2×2 block at ${c},${r}`).toBe(false);
        }
      }
    }
  });

  it("stays on the grid and clear of the mark", () => {
    for (const shape of SHAPES) {
      for (const { col, row } of cellsOf(shape)) {
        expect(col).toBeGreaterThanOrEqual(0);
        expect(col).toBeLessThan(GRID_COLS);
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(GRID_ROWS);
        expect(isUnderLogo(col, row)).toBe(false);
      }
    }
  });

  it("is one connected orthogonal run — each cell touches the previous one", () => {
    for (const shape of SHAPES) {
      const byOrder = [...shape.entries()].sort((a, b) => a[1] - b[1]).map(([i]) => i);
      for (let k = 1; k < byOrder.length; k++) {
        const a = { col: byOrder[k - 1] % GRID_COLS, row: Math.floor(byOrder[k - 1] / GRID_COLS) };
        const b = { col: byOrder[k] % GRID_COLS, row: Math.floor(byOrder[k] / GRID_COLS) };
        expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
      }
    }
  });

  it("fill order is a dense 0..n-1 sequence (drives the staggered fill-in)", () => {
    for (const shape of SHAPES) {
      expect([...shape.values()].sort((a, b) => a - b)).toEqual(
        Array.from({ length: shape.size }, (_, i) => i),
      );
    }
  });

  it("is long enough to read as a shape, never a stub", () => {
    for (const shape of SHAPES) expect(shape.size).toBeGreaterThanOrEqual(12);
  });
});

describe("assignSwatches — one colour per straight run", () => {
  // A hand-built path so the runs are known: 3 cells right, then 2 cells down.
  //   (2,2) (3,2) (4,2) then (4,3) (4,4)
  const cell = (col: number, row: number) => row * GRID_COLS + col;
  const path = new Map<number, number>([
    [cell(2, 2), 0],
    [cell(3, 2), 1],
    [cell(4, 2), 2],
    [cell(4, 3), 3],
    [cell(4, 4), 4],
  ]);

  it("gives every cell of the path a swatch, opening on the brand indigo", () => {
    const s = assignSwatches(path, 7, () => 0);
    expect(s.size).toBe(path.size);
    expect(s.get(cell(2, 2))).toBe(0);
  });

  it("holds one colour along a straight run", () => {
    const s = assignSwatches(path, 7, () => 0);
    expect(s.get(cell(3, 2))).toBe(s.get(cell(2, 2)));
    expect(s.get(cell(4, 2))).toBe(s.get(cell(2, 2)));
    // …and the second run holds its own.
    expect(s.get(cell(4, 4))).toBe(s.get(cell(4, 3)));
  });

  it("changes colour at the corner — and never repeats the previous one", () => {
    // Whatever the draw, two touching runs must not share a swatch: same colour on both
    // sides of a corner reads as ONE value twice as long.
    for (const r of [0, 0.4, 0.99]) {
      const s = assignSwatches(path, 7, () => r);
      expect(s.get(cell(4, 3))).not.toBe(s.get(cell(4, 2)));
    }
  });

  it("degrades rather than looping on a one-colour or empty palette", () => {
    expect([...assignSwatches(path, 1, () => 0).values()].every((v) => v === 0)).toBe(true);
    expect(assignSwatches(path, 0).size).toBe(0);
    expect(assignSwatches(new Map(), 7).size).toBe(0);
  });
});
