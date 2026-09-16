import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HUE_HEX, INK_HEX, LIME_HEX, THEME_HEX } from "./palette";

// Parity with the design tokens: the CSS is the home, this file mirrors it for a terminal.
// `styles.css` is an @import list; the tokens live in the sheets it names, so read them in
// cascade order (one level, like `scripts/gen-console-tokens.mjs`).
const ENTRY = resolve(__dirname, "../../../../../packages/ui/src/styles.css");
const css = readFileSync(ENTRY, "utf8").replace(/@import\s+"(\.\/[^"]+)";/g, (_, rel: string) =>
  readFileSync(resolve(dirname(ENTRY), rel), "utf8"),
);
const token = (name: string): string | undefined =>
  new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1].toLowerCase();

// The dark theme re-points a handful of tokens in its own sheets (`theme/spadeDark.css`,
// after the light kit in cascade order); everything else inherits `:root`. So a token has a
// LIGHT value (its first hex before that sheet) and, when overridden, a DARK one (its last hex after).
const DARK_AT = css.indexOf(readFileSync(resolve(dirname(ENTRY), "styles/theme/spadeDark.css"), "utf8"));
const hexes = (name: string) =>
  [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "g"))].map((m) => ({
    at: m.index ?? 0,
    hex: (m[1] as string).toLowerCase(),
  }));
const light = (name: string) => hexes(name).find((h) => h.at < DARK_AT)?.hex;
const dark = (name: string) =>
  hexes(name)
    .filter((h) => h.at > DARK_AT)
    .pop()?.hex;

describe("terminal palette = the app's redaction hues", () => {
  it("mirrors every --hl-<hue> token of styles.css", () => {
    for (const [hue, hex] of Object.entries(HUE_HEX))
      expect({ hue, hex }).toEqual({ hue, hex: token(`hl-${hue}`) });
  });

  it("mirrors the ink and the fixed brand hue", () => {
    expect(token("hl-lime")).toBe(LIME_HEX);
    expect(token("forest-900")).toBe(INK_HEX);
  });

  /** Rule 12 in a terminal: the block the mark and the footer paint has a ground, so its ink
   *  cannot be one literal. Both themes are read, and the pair each one publishes is the pair
   *  we print — the light ink is the lime, the dark one white, because that is what the app
   *  measured on the two indigos. */
  it("mirrors the brand pair and the bar surface in BOTH themes", () => {
    expect(THEME_HEX.light).toEqual({
      brand: light("brand"),
      inkOnBrand: light("lime"), // `--ink-on-brand: var(--lime)` in the light theme
      barBg: light("brand-tint"),
      barInk: light("text-strong"),
      muted: light("text-muted"),
    });
    expect(THEME_HEX.dark).toEqual({
      brand: dark("brand"),
      inkOnBrand: dark("ink-on-brand"), // stated outright there: the lime is near-black
      barBg: dark("brand-tint"),
      barInk: dark("text-strong"),
      muted: dark("text-muted"),
    });
    // The nine hues and their ink do NOT flip: a pill carries its own ground.
    expect(dark("hl-violet")).toBeUndefined();
    expect(dark("ink-on-hl")).toBeUndefined();
  });
});
