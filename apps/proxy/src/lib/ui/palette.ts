// The redaction hues, as hex, for a terminal that cannot read CSS. The CSS tokens in
// `packages/ui/src/styles.css` (`--hl-*`) are the home of these values; `palette.test.ts`
// READS that file and fails when the two drift (rule 9: a parity test, not a comment).
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

/** The one near-black ink that reads on every pastel (`--forest-900`). */
export const INK_HEX = "#0f1c06";
/** The brand accent (`--hl-lime`), for the mark and the frame — never a redaction hue. */
export const LIME_HEX = "#b8e635";
