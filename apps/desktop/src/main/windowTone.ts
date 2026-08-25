import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { app, type BrowserWindow } from "electron";

/**
 * The WINDOW's own background colour — the "contour": what the OS paints under the page,
 * visible at the rounded macOS corners and, most of all, in the strip a resize exposes
 * before the renderer has repainted it.
 *
 * It has to live in main (only main owns the window) but its value belongs to the THEME,
 * which only the renderer knows. Hence this module: the renderer reports the tone it just
 * applied, main paints it and remembers it for next launch.
 *
 * ⚠️ **There is deliberately NO theme→colour table here.** Copying one would be a second
 * home for a fact `styles.css` already owns (root rule 9), and it would drift the first
 * time a theme is re-toned — silently, since nothing renders this hex on screen next to
 * the real one. The renderer sends the COMPUTED value of `--surface-shell`, so the window
 * follows any theme, present or future, with no code here to update.
 */

/** Fallback for the very first launch, before any renderer has ever reported a tone:
 *  the default theme's shell tone (`blue`). One frame later the renderer replaces it. */
const FIRST_RUN_TONE = "#f1f1f6";

/** A colour we are willing to hand to Electron. The renderer is untrusted (root rule 7),
 *  and `setBackgroundColor` takes a CSS colour string — so the accepted shape is the
 *  narrow one we actually use, `#rrggbb`, and nothing else. Not a sanitiser: an input
 *  that isn't exactly this is REFUSED, not repaired. */
const HEX = /^#[0-9a-f]{6}$/i;

export function isWindowTone(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

const tonePath = (): string => join(app.getPath("userData"), "window-tone.json");

/** The tone to create the window with: the last one this machine reported, else the
 *  first-run default. A corrupt or absent file is not an error — it is a first run. */
export function loadWindowTone(): string {
  try {
    const raw = JSON.parse(readFileSync(tonePath(), "utf8")) as { tone?: unknown };
    return isWindowTone(raw.tone) ? raw.tone : FIRST_RUN_TONE;
  } catch {
    return FIRST_RUN_TONE;
  }
}

/**
 * Paint the window and remember the tone. Returns whether it was accepted, so the caller
 * (and its test) can tell a refused value from an applied one.
 *
 * Persisting is best-effort: failing to write must never cost the user the repaint they
 * can actually see. Only the NEXT launch would miss it.
 */
export function applyWindowTone(win: BrowserWindow | null, tone: unknown): boolean {
  if (!isWindowTone(tone)) return false;
  win?.setBackgroundColor(tone);
  try {
    writeFileSync(tonePath(), JSON.stringify({ tone }));
  } catch {
    /* the window is already repainted; only the next cold start loses it */
  }
  return true;
}
