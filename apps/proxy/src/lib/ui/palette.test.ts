import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HUE_HEX, INK_HEX, LIME_HEX } from "./palette";

// Parity with the design tokens: the CSS is the home, this file mirrors it for a terminal.
const css = readFileSync(resolve(__dirname, "../../../../../packages/ui/src/styles.css"), "utf8");
const token = (name: string): string | undefined =>
  new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1].toLowerCase();

describe("terminal palette = the app's redaction hues", () => {
  it("mirrors every --hl-<hue> token of styles.css", () => {
    for (const [hue, hex] of Object.entries(HUE_HEX))
      expect({ hue, hex }).toEqual({ hue, hex: token(`hl-${hue}`) });
  });

  it("mirrors the ink and the brand accent", () => {
    expect(token("hl-lime")).toBe(LIME_HEX);
    expect(token("forest-900")).toBe(INK_HEX);
  });
});
