import { describe, expect, it } from "vitest";
import {
  CAV_SWATCHES,
  cavHue,
  walkAdvance,
  walkCellAt,
  walkInitial,
  walkPosOf,
  walkSettled,
  type WalkGrid,
} from "./walk";

/** Deterministic, so a failure is reproducible rather than "sometimes". */
const seeded = (seed = 1) => {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
};
const GRIDS: WalkGrid[] = [
  { cols: 10, rows: 3, trail: 8 }, // the chat loader
  { cols: 46, rows: 12, trail: 180 }, // a terminal, full screen
  { cols: 4, rows: 2, trail: 3 },
];

describe("the redaction walk", () => {
  it("covers every cell exactly once per lap, and inverts", () => {
    for (const g of GRIDS) {
      const seen = new Set<string>();
      for (let pos = 0; pos < g.cols * g.rows; pos++) {
        const { col, row } = walkCellAt(pos, g);
        expect(col).toBeGreaterThanOrEqual(0);
        expect(col).toBeLessThan(g.cols);
        expect(row).toBeLessThan(g.rows);
        expect(walkPosOf(col, row, g)).toBe(pos);
        seen.add(`${col},${row}`);
      }
      expect(seen.size).toBe(g.cols * g.rows);
    }
  });

  /** The point of the cycle: a row-major order teleports on wrap, and two disconnected
   *  redactions do not read as one mark travelling. */
  it("never teleports — the wrap step included", () => {
    for (const g of GRIDS) {
      const total = g.cols * g.rows;
      for (let pos = 0; pos < total; pos++) {
        const a = walkCellAt(pos, g);
        const b = walkCellAt(pos + 1, g);
        expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
      }
    }
  });

  it("keeps exactly the trail lit, in blocks of two or three", () => {
    for (const g of GRIDS) {
      let s = walkInitial(g);
      const rnd = seeded();
      for (let i = 0; i < g.cols * g.rows * 2; i++) s = walkAdvance(s, g, rnd);
      expect(s.cells.filter((c) => c !== null)).toHaveLength(g.trail);
      expect(walkSettled(g, seeded()).cells.filter((c) => c !== null)).toHaveLength(g.trail);
    }
  });

  /** A ring that closes asks for a trail as long as the grid: it must light everything, not
   *  clear the cell it just lit. */
  it("treats a trail as long as the grid as everything lit", () => {
    const g: WalkGrid = { cols: 24, rows: 1, trail: 24 };
    let s = walkInitial(g);
    const rnd = seeded(3);
    for (let i = 0; i < 48; i++) s = walkAdvance(s, g, rnd);
    expect(s.cells.filter((c) => c !== null)).toHaveLength(23);
  });

  /** The swatches are the SECTIONS, slugged: a section renamed at the source must fail here
   *  rather than leave a swatch with no colour. `bar` is the deliberate exception. */
  it("resolves every swatch to a section hue, the black bar excepted", () => {
    CAV_SWATCHES.forEach((key, i) => {
      if (key === "bar") expect(cavHue(i)).toBeUndefined();
      else expect(cavHue(i), key).toBeTruthy();
    });
  });

  /** Two touching blocks in one colour merge into a single longer "value": the palette would
   *  look smaller than it is, and a value would read as twice its length. So no run of one
   *  swatch may ever exceed a block. */
  it("never lets two blocks in the same swatch touch", () => {
    const g = GRIDS[0] as WalkGrid;
    const rnd = seeded(7);
    let s = walkInitial(g);
    const total = g.cols * g.rows;
    for (let i = 0; i < 400; i++) {
      s = walkAdvance(s, g, rnd);
      let run = 0;
      for (let pos = 0; pos < total; pos++) {
        const here = s.cells[pos];
        const before = s.cells[(pos - 1 + total) % total];
        run = here !== null && here === before ? run + 1 : 1;
        if (here !== null) {
          expect(run).toBeLessThanOrEqual(3);
          expect(here).toBeLessThan(CAV_SWATCHES.length);
        }
      }
    }
  });
});
