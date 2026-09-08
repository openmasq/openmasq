import { describe, expect, it } from "vitest";
import { colorsWanted, createTty, formatDuration, formatMs, hexToRgb } from "./tty";

describe("tty", () => {
  it("honours NO_COLOR, FORCE_COLOR, TERM=dumb and a pipe", () => {
    expect(colorsWanted({}, true)).toBe(true);
    expect(colorsWanted({}, false)).toBe(false);
    expect(colorsWanted({ NO_COLOR: "1" }, true)).toBe(false);
    expect(colorsWanted({ TERM: "dumb" }, true)).toBe(false);
    expect(colorsWanted({ FORCE_COLOR: "1" }, false)).toBe(true);
  });

  it("renders 24-bit pills and measures visible width across escapes", () => {
    const t = createTty(true);
    expect(hexToRgb("#ff8fa3")).toEqual([255, 143, 163]);
    const p = t.pill("#ff8fa3", "#0f1c06", "NAME 2");
    expect(p).toContain("[48;2;255;143;163m");
    expect(t.width(p)).toBe(" NAME 2 ".length);
    expect(t.pad(t.bold("ab"), 5)).toBe(`${t.bold("ab")}   `);
    expect(createTty(false).pill("#ff8fa3", "#0f1c06", "NAME 2")).toBe("[NAME 2]");
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
