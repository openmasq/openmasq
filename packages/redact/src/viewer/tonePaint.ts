// THEME-RESOLVED redaction colours for the CANVAS painters.
//
// A `<canvas>` cannot wear a CSS class, so the scan/image painters used to carry their own
// frozen RGB table — which silently forked from the app's palette: re-tone `--hl-*` for a
// theme and the chat's marks follow while an uploaded document keeps the OLD colours. Worse,
// they inked every fake with ONE near-black, so on a saturated theme (where three of the six
// hues need WHITE text) the fake drawn inside the box became unreadable.
//
// So the painters resolve the SAME tokens the DOM marks use — `--hl-<hue>` for the fill and
// its mandatory partner `--ink-on-hl-<hue>` for the text on it (the invariant stated in
// `packages/ui/CLAUDE.md`: a hue always travels with its own ink). The hue behind a legacy
// tone name comes from `hueForTone`, so there is still ONE hue source (`CATEGORY_HUE`).
//
// The frozen table below is a FALLBACK only — for a non-DOM context (node-side rendering,
// unit tests) or a stylesheet that hasn't defined the token. Never the primary path.
import { hueForTone } from "../highlight/segments";

/** Fallback fill per HUE (0–255), used only when the CSS token can't be read. Same values as
 *  the `--hl-*` tokens — pinned by `packages/ui/src/styles/palette.parity.test.ts`, so the
 *  fallback cannot quietly become a second palette the way the old frozen table did. */
export const TONE_RGB: Record<string, [number, number, number]> = {
  violet: [183, 156, 255],
  sky: [111, 194, 255],
  mint: [95, 227, 192],
  teal: [122, 217, 224],
  amber: [255, 184, 92],
  gold: [255, 220, 122],
  pink: [255, 143, 163],
  slate: [179, 194, 218],
  red: [250, 122, 107],
};
/** Fallback ink — the historical near-black, readable on every fallback pastel above. */
export const INK = "#18230D";

export interface TonePaint {
  /** Opaque fill painted over the real glyphs. */
  fill: string;
  /** The ink the fake is drawn in, ON that fill. */
  ink: string;
}

/** Cache keyed by the ACTIVE THEME: resolving a custom property is a layout read, and a
 *  scan page paints hundreds of boxes. The key changes when the user switches theme, which
 *  is exactly when the answers change. */
let cacheKey: string | null = null;
let cache: Record<string, TonePaint> = {};

function themeKey(): string | null {
  if (typeof document === "undefined" || !document.documentElement) return null;
  return document.documentElement.getAttribute("data-theme") ?? "default";
}

/** The fill + ink for a legacy tone name, resolved from the live stylesheet when there is
 *  one, else from the frozen fallback. */
export function tonePaint(tone: string): TonePaint {
  const key = themeKey();
  if (key === null) return fallback(tone);
  if (key !== cacheKey) {
    cacheKey = key;
    cache = {};
  }
  const hit = cache[tone];
  if (hit) return hit;
  const style = getComputedStyle(document.documentElement);
  const fill = style.getPropertyValue(`--hl-${hueForTone(tone)}`).trim();
  const ink = style.getPropertyValue(`--ink-on-hl-${hueForTone(tone)}`).trim();
  // A missing token must not paint `""` (canvas keeps the PREVIOUS fillStyle — the value
  // would show through the box it was supposed to cover). Fall back per property.
  const fb = fallback(tone);
  const paint: TonePaint = { fill: fill || fb.fill, ink: ink || fb.ink };
  cache[tone] = paint;
  return paint;
}

function fallback(tone: string): TonePaint {
  // Through `hueForTone` like the primary path, so a retired tone name falls back to the
  // colour its section wears today rather than to amber.
  const [r, g, b] = TONE_RGB[hueForTone(tone)] ?? TONE_RGB.amber;
  return { fill: `rgb(${r},${g},${b})`, ink: INK };
}

/** Drop the memo — for tests, and for a caller that re-themes without a `data-theme` flip. */
export function resetTonePaintCache(): void {
  cacheKey = null;
  cache = {};
}
