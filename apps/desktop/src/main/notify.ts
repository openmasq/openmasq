import { Notification, type BrowserWindow } from "electron";
import { handle, obj } from "./ipc/handle";
import { BRAND } from "@openmasq/branding";

/** What a banner carries at most. Cut short: a system notification truncates
 *  anyway, and long text becomes unreadable in it. */
const MAX = 120;

const text = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.trim() ? v.slice(0, MAX) : fallback;

/**
 * The SYSTEM "a reply has arrived" notification.
 *
 * It lives in main for one sufficient reason: **the click must bring the
 * window to the foreground**, which a renderer can't do for itself. The rest
 * (when to notify, what to write) is decided on the UI side — `packages/ui/src/state/replyNotice.ts`
 * — and arrives here already composed.
 *
 * ⚠️ This process does NOT INVENT any text from the conversation, and reads none of it:
 * it receives a title and a body already stripped of content, bounds them, and displays them. The
 * only data that crosses over is the thread id, which is never displayed — it's used for the return trip.
 *
 * The renderer isn't trusted (rule 7): the id is sent back as-is to the window that
 * provided it, never used here to open, read, or write anything.
 */
export function registerNotifyIpc(getWin: () => BrowserWindow | null): void {
  handle("notify:supported", [], () => Notification.isSupported());

  handle("notify:reply", [obj], (_e, raw) => {
    if (!Notification.isSupported()) return { ok: false as const };
    const arg = raw as { conversationId?: unknown; title?: unknown; body?: unknown };
    const convId = typeof arg.conversationId === "string" ? arg.conversationId : "";
    if (!convId) return { ok: false as const };

    const n = new Notification({
      title: text(arg.title, BRAND.name),
      body: text(arg.body, "Réponse prête."),
      silent: false,
    });
    n.on("click", () => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      // Make the window visible BEFORE focusing it: minimized to the Dock, `focus()`
      // alone doesn't restore it, and the app "responds" without anything appearing.
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send("notify:activate", convId);
    });
    n.show();
    return { ok: true as const };
  });
}
