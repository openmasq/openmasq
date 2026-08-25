import { dialog, ipcMain, session, shell, systemPreferences } from "electron";
import type { WebContents } from "electron";
import { BRAND } from "@openmasq/branding";

// Without a permission handler Electron DENIES `getUserMedia` by default, so the
// composer's dictation mic (renderer → MediaRecorder) would never get audio. We
// install a MINIMAL allow-list: grant microphone/media + clipboard, refuse everything
// else. (`notifications` dropped — the renderer never uses the Notification API.)
const ALLOWED = new Set([
  "media", // getUserMedia audio (Chromium groups mic/cam under "media")
  "audioCapture",
  "clipboard-sanitized-write", // navigator.clipboard.writeText (copy buttons)
]);

// SECURITY: only ever grant these to the app's OWN page (packaged `file://` bundle or
// the loopback dev server) — never to remote content. Defense in depth behind the main
// window's navigation guard, so even a navigated-away page can't inherit mic/clipboard.
function isAppWebContents(wc: WebContents | null | undefined): boolean {
  try {
    const url = wc?.getURL();
    if (!url) return false;
    if (url.startsWith("file:")) return true;
    const u = new URL(url);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/**
 * Grant OS-level microphone access. On macOS the Chromium permission handler is
 * NOT enough — the hardened runtime gates the mic behind TCC, so `getUserMedia`
 * throws a DOMException until the app explicitly requests access (which shows the
 * one-time system prompt; needs `NSMicrophoneUsageDescription` in the Info.plist).
 * Windows/Linux have no such gate → always true. Returns whether the mic is usable.
 */
async function ensureMicAccess(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") return true;
  // "not-determined" → trigger the native OS prompt once (needs
  // `NSMicrophoneUsageDescription`). If granted, done.
  if (status === "not-determined") {
    try {
      if (await systemPreferences.askForMediaAccess("microphone")) return true;
    } catch {
      /* fall through to the guidance dialog below */
    }
  }
  // denied / restricted / prompt-declined → macOS won't let us re-prompt, so a
  // silent failure looks like a dead button. Show a native dialog offering to
  // open the exact System Settings pane where the user can grant access.
  await promptOpenMicSettings();
  return false;
}

/** Native "mic blocked" dialog with a one-click jump to the System Settings
 *  Microphone pane (macOS deep link). Best-effort — never throws to the caller. */
async function promptOpenMicSettings(): Promise<void> {
  try {
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Micro bloqué",
      message: `${BRAND.name} n'a pas accès au microphone`,
      detail:
        "Autorisez le micro dans Réglages Système → Confidentialité et sécurité → " +
        "Microphone, puis réessayez la dictée.",
      buttons: ["Ouvrir les Réglages", "Annuler"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      );
    }
  } catch {
    /* dialog/openExternal unavailable — nothing more we can do */
  }
}

/** Grant the microphone permission the dictation feature needs (Chromium session
 *  handler + macOS TCC via the `media:ensure-mic` IPC); deny the rest. Call once
 *  on `app.whenReady`, before creating any window. */
export function installMediaPermissions(): void {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((wc, permission, callback) => {
    callback(isAppWebContents(wc) && ALLOWED.has(permission));
  });
  // getUserMedia also does a SYNCHRONOUS permission check — grant media there too.
  s.setPermissionCheckHandler((wc, permission) => permission === "media" && isAppWebContents(wc));
  // The renderer calls this right before recording so macOS shows/refreshes the
  // OS mic prompt (a granted Chromium permission alone still fails under TCC).
  ipcMain.handle("media:ensure-mic", () => ensureMicAccess());
}
