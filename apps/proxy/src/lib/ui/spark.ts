// The two places colour ACCUMULATES: a bar per category on a request, and one block per
// request in the footer. Both are the same idea — a shape whose colours are the redaction
// hues, so a glance says what kind of data this session is protecting without reading a
// number.
import { CATEGORY_HUE, redactionCategory } from "@openmasq/redact";
import { HUE_HEX } from "./palette.js";
import type { Tty } from "./tty.js";

/** Eight heights: a bar is a PROPORTION, never a count — the count is written beside it. */
const BLOCKS = "▁▂▃▄▅▆▇█";

const hexOf = (category: string): string =>
  HUE_HEX[CATEGORY_HUE[redactionCategory(category)] ?? "slate"];

/**
 * One bar per category, tallest first, each in its own hue. `paint` lets the caller draw
 * inside a filled row, where a reset would punch a hole in the fill.
 */
export function histogram(
  tty: Tty,
  counts: Record<string, number>,
  max = 8,
  paint: (hex: string, s: string) => string = (hex, s) => tty.fg(hex, s),
): string {
  // Without colour the shape says nothing: eight identical blocks are noise, and the counts
  // are written beside them anyway.
  if (!tty.colors) return "";
  const sorted = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
  if (!sorted.length) return "";
  const top = sorted[0][1];
  return sorted.map(([k, n]) => paint(hexOf(k), BLOCKS[height(n, top)] as string)).join("");
}

function height(n: number, top: number): number {
  if (top <= 1) return BLOCKS.length - 1;
  return Math.min(BLOCKS.length - 1, Math.max(0, Math.round((n / top) * (BLOCKS.length - 1))));
}

/** One block per recent request, oldest left — the session's last minutes at a glance. */
export function activity(
  tty: Tty,
  recent: readonly string[],
  max: number,
  paint: (hex: string, s: string) => string = (hex, s) => tty.fg(hex, s),
): string {
  if (!tty.colors) return "";
  return recent
    .slice(-Math.max(0, max))
    .map((hex) => paint(hex, "▇"))
    .join("");
}
