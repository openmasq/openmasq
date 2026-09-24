import { describe, expect, it } from "vitest";
import { WORDMARK_COLS, WORDMARK_ROWS, wordmarkCells } from "./wordmark";

const render = (reveal: number) =>
  Array.from({ length: WORDMARK_ROWS }, (_, r) =>
    Array.from({ length: WORDMARK_COLS }, (_, c) =>
      wordmarkCells(reveal).has(`${c},${r}`) ? "#" : ".",
    ).join(""),
  );

describe("the wordmark", () => {
  it("spells the name, in a box the grid can be measured against", () => {
    const rows = render(1);
    expect(rows).toHaveLength(WORDMARK_ROWS);
    for (const r of rows) expect(r).toHaveLength(WORDMARK_COLS);
    // The O: two-cell top and bottom, hollow in between — if a glyph table gets edited into
    // nonsense, this is what stops it reaching a screen.
    expect(rows[0]?.slice(0, 4)).toBe("####");
    expect(rows[1]?.slice(0, 4)).toBe("####");
    expect(rows[3]?.slice(0, 4)).toBe("#..#");
    expect(rows[WORDMARK_ROWS - 1]?.slice(0, 4)).toBe("####");
  });

  /** The name is WRITTEN as the field grows, not switched on. */
  it("fills left to right", () => {
    expect(wordmarkCells(0).size).toBe(0);
    const half = render(0.5);
    expect(half[0]?.startsWith("####")).toBe(true);
    expect(half[0]?.endsWith("....")).toBe(true);
    expect(wordmarkCells(0.5).size).toBeLessThan(wordmarkCells(1).size);
  });
});
