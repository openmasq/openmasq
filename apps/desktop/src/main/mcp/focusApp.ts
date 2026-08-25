import { app, BrowserWindow } from "electron";

/**
 * Bring the app's main window back to the foreground.
 *
 * Used as the loopback's `onRedirect` hook: OAuth consent runs in the SYSTEM
 * browser (Google/Microsoft block embedded webviews — see the callers), so when
 * the 127.0.0.1 loopback catches the redirect the user is still looking at a
 * browser tab we don't control and can't close. The next best thing is to pull
 * the app itself forward so they land back on the app the instant the code arrives.
 * The agent browser runs in a SEPARATE process, so it never shows up in this
 * process's window list — we only ever focus the real app window.
 */
export function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  // macOS: a background app needs `steal` to actually become frontmost.
  app.focus({ steal: true });
}
