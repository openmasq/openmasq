import type { BrowserWindow } from "electron";

/**
 * THE main window, for the modules that must reach it after creation (deep links, MCP
 * notifiers, the updater, the notify banner). One holder, so no module keeps a stale
 * copy of a window that was closed and reopened (macOS keeps the app alive without one).
 */
let win: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return win;
}

export function setMainWindow(w: BrowserWindow | null): void {
  win = w;
}

/** Run `fn` against the window when it exists and is not destroyed — the common guard. */
export function withMainWindow(fn: (w: BrowserWindow) => void): void {
  if (win && !win.isDestroyed()) fn(win);
}
