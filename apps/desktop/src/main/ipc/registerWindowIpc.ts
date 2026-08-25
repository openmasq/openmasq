import type { BrowserWindow } from "electron";
import { applyWindowTone } from "../windowTone";
import { handle, any } from "./handle";

/**
 * The WINDOW family — today a single handler, and it lives here rather than in
 * `index.ts` because that is where a new handler belongs (`ipc/CLAUDE.md`).
 *
 * `window:set-tone` lets the renderer report the theme's shell tone so the window's own
 * background (the contour at the rounded corners, and the strip a resize exposes before
 * the renderer repaints) follows the theme instead of a fixed near-white.
 *
 * It grants NOTHING, which is what makes it safe to accept from an untrusted renderer:
 * `windowTone.ts` validates `#rrggbb` and REFUSES anything else rather than repairing it,
 * and a refusal is a no-op — the window keeps the tone it already had. Main deliberately
 * holds no theme→colour table: the renderer sends the COMPUTED `--surface-shell`, so
 * `styles.css` stays the single home for those hexes (rule 9).
 *
 * `getWindow` is a THUNK: the window is created after registration, and it is replaced on
 * a macOS re-activate, so capturing the reference here would paint a dead one.
 */
export function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
  handle("window:set-tone", [any], (_e, tone) => applyWindowTone(getWindow(), tone));
}
