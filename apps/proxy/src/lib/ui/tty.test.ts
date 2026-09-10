import { describe, expect, it } from "vitest";
import { colorsWanted, createTty, formatDuration, formatMs, hexToAnsi256, hexToRgb } from "./tty";

const ESC = `${String.fromCharCode(27)}[`;
const t24 = (columns = 80) => createTty(true, () => columns, { depth: 24, theme: "dark" });

describe("tty", () => {
  it("honours NO_COLOR, FORCE_COLOR, TERM=dumb and a pipe", () => {
    expect(colorsWanted({}, true)).toBe(true);
    expect(colorsWanted({}, false)).toBe(false);
    expect(colorsWanted({ NO_COLOR: "1" }, true)).toBe(false);
    expect(colorsWanted({ TERM: "dumb" }, true)).toBe(false);
    expect(colorsWanted({ FORCE_COLOR: "1" }, false)).toBe(true);
  });

  it("renders 24-bit pills and measures visible width across escapes", () => {
    const t = t24();
    expect(hexToRgb("#ff8fa3")).toEqual([255, 143, 163]);
    const p = t.pill("#ff8fa3", "#0f1c06", "NAME 2");
    expect(p).toContain(`${ESC}48;2;255;143;163m`);
    expect(t.width(p)).toBe(" NAME 2 ".length);
    expect(t.pad(t.bold("ab"), 5)).toBe(`${t.bold("ab")}   `);
    expect(createTty(false).pill("#ff8fa3", "#0f1c06", "NAME 2")).toBe("[NAME 2]");
  });

  /** A terminal that never announced truecolor gets the 256-colour cube instead: a 24-bit
   *  escape it does not understand is not a slightly-off colour, it is garbage on the line. */
  it("falls back to the 256-colour cube when the terminal claims no truecolor", () => {
    const t = createTty(true, () => 80, { depth: 8, theme: "dark" });
    expect(t.fg("#ff8fa3", "x")).toBe(`${ESC}38;5;${hexToAnsi256("#ff8fa3")}mx${ESC}0m`);
    expect(t.pill("#ff8fa3", "#0f1c06", "A")).toContain(`${ESC}48;5;`);
    // A near-grey lands on the ramp, a hue in the cube, and both stay in range.
    expect(hexToAnsi256("#b3c2da")).toBeGreaterThan(15);
    expect(hexToAnsi256("#808080")).toBeGreaterThanOrEqual(232);
    expect(hexToAnsi256("#000000")).toBe(16);
    expect(hexToAnsi256("#ffffff")).toBe(231);
  });

  /** The footer is a filled row: a reset inside it would clear the background for the rest
   *  of the line, so the pens re-state the fill instead of ending it. */
  it("fills a row whose inner pens never reset", () => {
    const t = t24();
    const row = t.fill(
      "#1c1c4a",
      "#f1f2f7",
      20,
      (pen) => ` ${pen.strong("a")}${pen.ink("#5fe3c0", "b")}`,
    );
    expect(t.width(row)).toBe(20);
    expect(row.startsWith(`${ESC}48;2;28;28;74m`)).toBe(true);
    expect(row.endsWith(`${ESC}0m`)).toBe(true);
    expect(row.slice(0, -`${ESC}0m`.length)).not.toContain(`${ESC}0m`); // one reset, at the end
    expect(createTty(false).fill("#1c1c4a", "#f1f2f7", 6, (pen) => pen.strong("ab"))).toBe(
      "ab    ",
    );
  });

  it("counts columns, not code units — an emoji is two, and fit cuts to the width", () => {
    const t = createTty(false, () => 20);
    expect(t.width("🙂")).toBe(2);
    expect(t.pad("🙂", 4)).toBe("🙂  "); // two columns of padding, not three
    expect(t.width(t.fit("x".repeat(60)))).toBeLessThanOrEqual(20);
    expect(t.fit("short")).toBe("short");
  });

  it("formats times the way an operator reads them", () => {
    expect(formatMs(412)).toBe("412ms");
    expect(formatMs(1234)).toBe("1.2s");
    expect(formatMs(12345)).toBe("12s");
    expect(formatDuration(45000)).toBe("45s");
    expect(formatDuration(5 * 60000)).toBe("5 min");
    expect(formatDuration(125 * 60000)).toBe("2 h 5 min");
  });
});
