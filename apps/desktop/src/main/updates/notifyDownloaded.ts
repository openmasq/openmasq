import { Notification, type BrowserWindow } from "electron";
import { BRAND } from "@openmasq/branding";

import { mainMessages } from "../i18n";

/**
 * The SYSTEM banner « a version is ready » — for the user who is NOT looking at the app.
 *
 * The renderer announces the downloaded version itself (`useUpdateReady`, with its note);
 * a banner on top of that, while the window is in front, would say the same thing twice.
 * So it fires only when the window is not focused (minimized, hidden, another app in
 * front), and once per version: the updater re-signals `update-downloaded` on later checks.
 *
 * The click brings the window back, where the announcement is already open. It installs
 * nothing: installing stays an act inside the app. Nothing here comes from the renderer.
 */
const notified = new Set<string>();

export function shouldNotifyDownloaded(
  version: string | undefined,
  windowFocused: boolean,
  already: ReadonlySet<string>,
): version is string {
  return !!version && !windowFocused && !already.has(version);
}

export function notifyDownloaded(version: string | undefined, getWin: () => BrowserWindow | null): void {
  const win = getWin();
  const focused = !!win && !win.isDestroyed() && win.isVisible() && win.isFocused();
  if (!shouldNotifyDownloaded(version, focused, notified) || !Notification.isSupported()) return;
  notified.add(version);

  const t = mainMessages().desktopMain.updates;
  const n = new Notification({ title: t.readyTitle(BRAND.name, version), body: t.readyBody, silent: false });
  n.on("click", () => {
    const w = getWin();
    if (!w || w.isDestroyed()) return;
    // Restore BEFORE focusing: minimized to the Dock, `focus()` alone shows nothing.
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });
  n.show();
}
