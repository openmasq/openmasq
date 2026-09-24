// A category becomes a pill in its own hue — the same mapping the app paints a mark with, so
// EMAIL is the same blue in the chat and in this terminal.
import { CATEGORY_HUE, redactionCategory } from "@openmasq/redact";
import { HUE_HEX, INK_HEX } from "./palette.js";
import type { Tty } from "./tty.js";

/** The hue a category is painted in — the app's own mapping, and the one home for it. */
export function hueHexOf(category: string): string {
  return HUE_HEX[CATEGORY_HUE[redactionCategory(category)] ?? "slate"];
}

export function categoryPill(tty: Tty, category: string, n: number): string {
  return categoryTag(tty, category, ` ${n}`);
}

/** The same pill without a count — one per revealed span. */
export function categoryTag(tty: Tty, category: string, suffix = ""): string {
  const key = redactionCategory(category);
  return tty.pill(hueHexOf(key), INK_HEX, `${key.toUpperCase()}${suffix}`);
}

/** The pills for a tally, biggest count first; `max` keeps a status bar from overflowing. */
export function categoryPills(
  tty: Tty,
  counts: Record<string, number>,
  max = Number.POSITIVE_INFINITY,
): string {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, max).map(([k, n]) => categoryPill(tty, k, n));
  if (sorted.length > shown.length) shown.push(tty.dim(`+${sorted.length - shown.length}`));
  return shown.join(" ");
}

export function statusHex(status: number): string {
  return status < 300 ? HUE_HEX.mint : status < 500 ? HUE_HEX.amber : HUE_HEX.red;
}
