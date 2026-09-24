import { describe, expect, it } from "vitest";
import { disabledKindsFor } from "../masker";
import { HUE_HEX, THEME_HEX } from "./palette";
import { splashFrame, splashWanted, type SplashView } from "./splash";
import { createTty } from "./tty";
import { WORDMARK_COLS, WORDMARK_ROWS } from "./wordmark";

const tty = (columns = 92) => createTty(true, () => columns, { depth: 24, theme: "dark" });
const view = (level: "standard" | "renforce" | "strict", extra: string[] = []): SplashView => ({
  level,
  disabled: disabledKindsFor(level, extra),
});
const text = (t: number, v = view("strict"), columns = 92, rows = 24) =>
  tty(columns).strip(splashFrame(tty(columns), t, rows, v).join("\n"));
const bg = (hex: string) =>
  `${String.fromCharCode(27)}[48;2;${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(";")}m`;
const blocks = (t: number, hex: string, v = view("strict")) =>
  splashFrame(tty(), t, 24, v).join("").split(bg(hex)).length - 1;
const blocksAt = (columns: number, hex: string) =>
  splashFrame(tty(columns), 1, 24, view("standard")).join("").split(bg(hex)).length - 1;

describe("the opening sequence", () => {
  /** It is the app's loader, around the name: the palette travels a RING, and the name is the
   *  brand. Colour spread over a whole screen was tried and removed — nine hues mean nine
   *  categories, and a field of them means nothing. */
  it("runs the palette around the name, and writes the name in the brand", () => {
    const ring = [HUE_HEX.violet, HUE_HEX.sky, HUE_HEX.mint, HUE_HEX.amber, HUE_HEX.pink];
    const lit = ring.reduce((n, hue) => n + blocks(0.5, hue), 0);
    expect(lit).toBeGreaterThan(0);
    expect(blocks(0.5, THEME_HEX.dark.brand)).toBeGreaterThan(0);
    // The ring CLOSES at the end: the name ends up enclosed, not caught mid-lap.
    const perimeter = (WORDMARK_COLS + 4) * 2 + (WORDMARK_ROWS + 4) * 2 - 4;
    const litAtEnd =
      ring.reduce((n, hue) => n + blocks(1, hue), 0) +
      blocks(1, HUE_HEX.slate) +
      blocks(1, HUE_HEX.gold) +
      blocks(1, HUE_HEX.red) +
      blocks(1, HUE_HEX.teal) +
      blocks(1, "#0f1c06");
    expect(litAtEnd).toBeGreaterThanOrEqual(perimeter - 2);
  });

  /** The name is WRITTEN while the loader runs, not switched on at the end. */
  it("writes the name as it goes", () => {
    expect(blocks(0.05, THEME_HEX.dark.brand)).toBe(0);
    expect(blocks(0.35, THEME_HEX.dark.brand)).toBeGreaterThan(0);
    expect(blocks(1, THEME_HEX.dark.brand)).toBeGreaterThan(blocks(0.35, THEME_HEX.dark.brand));
  });

  /**
   * ⚠️ The one thing here that can be WRONG. At `standard` — the DEFAULT — names and companies
   * are not looked for at all, and the sequence has to say so: an opening that let the reader
   * believe otherwise is an overstatement about where personal data goes (rule 8).
   */
  it("names what this level leaves in clear, and counts what it cannot fit", () => {
    const standard = text(1, view("standard"));
    expect(standard).toContain("level standard");
    expect(standard).toContain("left in clear:");
    expect(standard).toContain("names");
    expect(standard).toContain("companies");
    expect(standard).not.toContain("every value the engine finds is replaced");
    expect(standard).toMatch(/\+\d+ more/); // the rest is counted, never dropped

    const strict = text(1, view("strict"));
    expect(strict).toContain("every value the engine finds is replaced");
    expect(strict).not.toContain("left in clear:");

    // `--disable` is part of the same arithmetic, so it lands in the same line.
    expect(text(1, view("strict", ["email"]))).toContain("e-mails");
  });

  /** The name has to survive a real terminal. Two columns a cell where there is room, one
   *  where there is not — the drawn name is dropped only when even that will not fit. */
  it("draws the name wide, then narrow, and writes it out only when it cannot", () => {
    const drawn = (columns: number) => blocksAt(columns, THEME_HEX.dark.brand) > 0;
    expect(drawn(120)).toBe(true);
    expect(drawn(92)).toBe(true);
    expect(drawn(80)).toBe(true); // one column a cell rather than no letters
    expect(drawn(62)).toBe(true);
    expect(drawn(44)).toBe(false);
    expect(text(1, view("standard"), 44)).toContain("OpenMasq");
    // A terminal too SHORT for the ring and the claim also gets the written name.
    expect(tty().strip(splashFrame(tty(92), 1, 10, view("standard")).join("\n"))).toContain(
      "OpenMasq",
    );
  });

  /** A frame that overflows the screen scrolls the alternate screen and tears. */
  it("never draws outside the terminal, and falls back to the word when narrow", () => {
    for (const columns of [120, 92, 88]) {
      for (const t of [0, 0.3, 0.7, 1]) {
        const lines = splashFrame(tty(columns), t, 24, view("standard"));
        expect(lines.length).toBeLessThanOrEqual(24);
        for (const l of lines) expect(tty().width(tty().strip(l))).toBeLessThanOrEqual(columns);
      }
    }
    // Too narrow for the drawn letters, even at one column a cell: the name is written out
    // rather than three of its letters.
    expect(text(1, view("standard"), 40)).toContain("OpenMasq");
  });

  it("plays for an operator and for nobody else", () => {
    const on = { enabled: true, colors: true, isTTY: true, json: false, quiet: false, env: {} };
    expect(splashWanted(on)).toBe(true);
    expect(splashWanted({ ...on, enabled: false })).toBe(false); // --no-splash
    expect(splashWanted({ ...on, colors: false })).toBe(false); // NO_COLOR, a pipe
    expect(splashWanted({ ...on, isTTY: false })).toBe(false);
    expect(splashWanted({ ...on, json: true })).toBe(false);
    expect(splashWanted({ ...on, quiet: true })).toBe(false);
    expect(splashWanted({ ...on, env: { CI: "1" } })).toBe(false);
  });
});
