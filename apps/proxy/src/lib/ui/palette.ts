// The redaction hues and the brand pair, as hex, for a terminal that cannot read CSS. The
// tokens in `packages/ui/src/styles.css` are the home of these values; `palette.test.ts`
// READS that file — the light `:root` AND the `[data-theme="dark"]` block — and fails when
// the two drift (rule 9: a parity test, not a comment).
import type { Hue } from "@openmasq/redact";

export const HUE_HEX: Record<Hue, string> = {
  violet: "#b79cff",
  sky: "#6fc2ff",
  mint: "#5fe3c0",
  teal: "#7ad9e0",
  amber: "#ffb85c",
  gold: "#ffdc7a",
  pink: "#ff8fa3",
  slate: "#b3c2da",
  red: "#fa7a6b",
};

/** The one near-black ink that reads on every pastel (`--ink-on-hl` → `--forest-900`). The
 *  nine hues and their ink are the same in both themes — a pill carries its own ground, so
 *  it needs no theme. */
export const INK_HEX = "#0f1c06";
/** `--hl-lime`: a FIXED brand hue, never a redaction one. */
export const LIME_HEX = "#b8e635";

/** What flips with the terminal's ground.
 *
 *  ⚠️ The accent is a PAIR, not a colour. `--brand` is a deep indigo: as a foreground on an
 *  unknown ground it is either invisible (dark terminal) or thin (light one), so what travels
 *  to a terminal is the block the app already paints — the fill and the ink MADE for it
 *  (`--ink-on-brand`). And the app re-points both per theme (rule 12): the light lime is
 *  measured on `#3939fa` and unreadable on the dark theme's lighter indigo, where the app
 *  itself switches to white. Copying one theme's pair would put a near-invisible ink on the
 *  other's fill — which is exactly the bug rule 12 describes. */
export interface ThemeHex {
  /** `--brand` — the fill of the mark, and the accent inside the footer bar. */
  brand: string;
  /** `--ink-on-brand` — the only ink allowed on that fill. */
  inkOnBrand: string;
  /** `--brand-tint` — the footer bar's ground. */
  barBg: string;
  /** `--text-strong` — the ink on that ground. */
  barInk: string;
  /** `--text-muted` — metadata inside the bar, where a dim escape has no fill to dim. */
  muted: string;
}

export const THEME_HEX: Record<ThemeName, ThemeHex> = {
  light: {
    brand: "#3939fa",
    inkOnBrand: "#c7f08a",
    barBg: "#e7e7ff",
    barInk: "#141726",
    muted: "#565c78",
  },
  dark: {
    brand: "#5252ff",
    inkOnBrand: "#ffffff",
    barBg: "#1c1c4a",
    barInk: "#f1f2f7",
    muted: "#969aab",
  },
};

export type ThemeName = "light" | "dark";
