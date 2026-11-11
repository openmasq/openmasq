// The main window when it stops: it hung, or its page (the renderer process) is gone.
// Without this the person faces a frozen or blank window with no word and no way back, and
// main learns nothing it can report. Here they are TOLD, offered a reload, and the event
// leaves as a bounded CODE (`window` / `renderer-<reason>`) — never a URL, never content.
import { app, dialog, type BrowserWindow } from "electron";
import { BRAND } from "@openmasq/branding";
import { mainMessages } from "./i18n";
import { reportMainError } from "./runtime/errorReport";

/** How long a window may stay unresponsive before the person is asked (a long paste, a big
 *  conversation opening, a GC pause all recover on their own well before). */
export const HUNG_ASK_MS = 15_000;

/** Electron's `render-process-gone` reasons — an ALLOW list: an unknown one is `other`. */
const REASONS = new Set(["abnormal-exit", "killed", "crashed", "oom", "launch-failed", "integrity-failure"]);

/** The reported code for a gone renderer; `null` when there is nothing to say (a clean exit). Pure. */
export function goneCode(reason: string): string | null {
  if (reason === "clean-exit") return null;
  return `renderer-${REASONS.has(reason) ? reason : "other"}`;
}

/** What the person chose in a dialog of this file. */
type Choice = "reload" | "wait" | "quit";

/** Which choice a button index is, per dialog. Pure. */
export function choiceOf(kind: "hung" | "gone", index: number): Choice {
  if (kind === "hung") return index === 0 ? "reload" : "wait";
  return index === 0 ? "reload" : "quit";
}

interface HealthDeps {
  ask: (kind: "hung" | "gone", oom: boolean) => Promise<Choice>;
  reload: () => void;
  quit: () => void;
  report: (code: string) => void;
  setTimer: (fn: () => void, ms: number) => () => void;
}

/**
 * The decisions, without Electron (`windowHealth.test.ts`):
 * - HUNG: nothing for `HUNG_ASK_MS`; still hung then ⇒ reported once per episode and the
 *   person asked. « Attendre » keeps waiting (asked again only on a NEW episode).
 * - GONE: reported with its reason as a code, and the person asked every time — a page that
 *   is gone never comes back alone. One dialog at a time.
 */
export function windowHealth(d: HealthDeps) {
  let cancelHung: (() => void) | null = null;
  let asking = false;
  const ask = async (kind: "hung" | "gone", oom = false): Promise<void> => {
    if (asking) return;
    asking = true;
    try {
      const choice = await d.ask(kind, oom);
      if (choice === "reload") d.reload();
      else if (choice === "quit") d.quit();
    } finally {
      asking = false;
    }
  };
  return {
    unresponsive(): void {
      if (cancelHung) return;
      cancelHung = d.setTimer(() => {
        cancelHung = null;
        d.report("unresponsive");
        void ask("hung");
      }, HUNG_ASK_MS);
    },
    responsive(): void {
      cancelHung?.();
      cancelHung = null;
    },
    gone(reason: string): void {
      cancelHung?.();
      cancelHung = null;
      const code = goneCode(reason);
      if (!code) return;
      d.report(code);
      void ask("gone", reason === "oom");
    },
  };
}

/** Wire the main window. `reload` loads the app page again (never a URL from anywhere else). */
export function watchWindowHealth(win: BrowserWindow, reload: () => void): void {
  const health = windowHealth({
    ask: async (kind, oom) => {
      const t = mainMessages().desktopMain.windowHealth;
      const hung = kind === "hung";
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        title: hung ? t.hungTitle : t.goneTitle,
        message: hung ? t.hungMessage(BRAND.name) : t.goneMessage(BRAND.name),
        detail: hung ? t.hungDetail : oom ? t.goneMemoryDetail : t.goneDetail,
        buttons: hung ? [t.reload, t.wait] : [t.reload, t.quit],
        defaultId: 0,
        cancelId: 1,
      });
      return choiceOf(kind, response);
    },
    reload: () => {
      if (!win.isDestroyed()) reload();
    },
    quit: () => app.quit(),
    report: (code) => reportMainError("window", code, new Error(`window: ${code}`)),
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  });
  win.on("unresponsive", () => health.unresponsive());
  win.on("responsive", () => health.responsive());
  win.webContents.on("render-process-gone", (_e, details) => health.gone(details.reason));
}
