import { BrowserWindow, ipcMain, powerMonitor } from "electron";
import electronUpdater from "electron-updater";

import { quitAndInstallSafely } from "./install";
import { logUpdate } from "./log";

const { autoUpdater } = electronUpdater;

/**
 * The AUTOMATIC install of a downloaded build — when the app is in the background or
 * the user is away. The "update ready" modal remains the nominal path;
 * this is the catch-up for the app that's never restarted (open for days, the
 * update waiting for a click that never came).
 *
 * FAIL-CLOSED everywhere: at the slightest doubt we do NOT restart — a missed restart
 * at worst misses an install window (the next tick catches it), whereas a
 * restart during an agentic turn or on an unsent draft destroys
 * work (drafts are memory-only, ON PURPOSE — see `state/CLAUDE.md`).
 * Hence `shouldAutoInstall`'s four guards AND the renderer probe: main asks
 * "are you quiescent?" at decision time (a turn in flight? a draft somewhere?) and
 * treats no answer as "busy".
 */
const AUTO_POLL_MS = 60_000;
/** The user is AWAY: no system input for 10 min (powerMonitor). */
export const AUTO_IDLE_AWAY_S = 10 * 60;
/** The app has been in the BACKGROUND for a while: blurred without interruption for 30 min.
 *  Longer than the away threshold: the user may be working ALONGSIDE, and the relaunch
 *  after install steals the foreground — we don't pay that price for a 5-minute detour. */
export const AUTO_BLURRED_MS = 30 * 60_000;
/** The renderer probe answers quickly or not at all (busy/dead renderer ⇒ busy). */
const QUIESCENCE_TIMEOUT_MS = 3_000;

export interface AutoInstallSignals {
  /** A build is staged (update-downloaded received, no install failure since). */
  staged: boolean;
  /** A window of the app has OS focus. */
  focused: boolean;
  /** Seconds since the last user input, WHOLE system. */
  idleS: number;
  /** How long the app has been blurred without interruption (0 if focused). */
  blurredMs: number;
  /** Conversation stream in flight on the MAIN side (belt — the renderer knows too). */
  mainBusy: boolean;
  /** Answer from the renderer probe. `null` = no answer ⇒ BUSY (fail-closed). */
  rendererBusy: boolean | null;
}

/** The decision, pure (tested): background for a while OR user away — and nothing in
 *  flight anywhere. Every condition that's in doubt refuses. */
export function shouldAutoInstall(s: AutoInstallSignals): boolean {
  if (!s.staged || s.focused || s.mainBusy) return false;
  if (s.rendererBusy !== false) return false;
  return s.idleS >= AUTO_IDLE_AWAY_S || s.blurredMs >= AUTO_BLURRED_MS;
}

/** Asks the renderer whether it's quiescent (no send in flight, no draft).
 *  Silence/error ⇒ `null` (the caller reads that as "busy"). */
function askRendererBusy(win: BrowserWindow): Promise<boolean | null> {
  return new Promise((resolve) => {
    const id = `q${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const channel = `updates:quiescence-reply:${id}`;
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(channel);
      resolve(null);
    }, QUIESCENCE_TIMEOUT_MS);
    ipcMain.once(channel, (_e, busy: unknown) => {
      clearTimeout(timer);
      resolve(typeof busy === "boolean" ? busy : null);
    });
    try {
      win.webContents.send("updates:quiescence", id);
    } catch {
      clearTimeout(timer);
      ipcMain.removeAllListeners(channel);
      resolve(null);
    }
  });
}

/**
 * Arms the timer. `mainBusy` is injected (the `chat:*` streams map lives in
 * `index.ts`); the "staged" state is listened to right here: `update-downloaded` arms it,
 * a post-download `error` disarms it (the install failed, `poll.ts` retries).
 */
export function startAutoInstall(
  getWin: () => BrowserWindow | null,
  probes: { mainBusy: () => boolean },
): void {
  let staged = false;
  let installing = false;
  let blurredSince: number | null = null;

  autoUpdater.on("update-downloaded", () => {
    staged = true;
  });
  autoUpdater.on("error", () => {
    staged = false;
  });

  const tick = async (): Promise<void> => {
    if (!staged || installing) return;
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    const focused = BrowserWindow.getFocusedWindow() != null;
    if (focused) {
      blurredSince = null;
      return;
    }
    if (blurredSince == null) blurredSince = Date.now();
    const signals: AutoInstallSignals = {
      staged,
      focused,
      idleS: powerMonitor.getSystemIdleTime(),
      blurredMs: Date.now() - blurredSince,
      mainBusy: probes.mainBusy(),
      // Asked LAST, only once everything else is already met — no pinging the
      // renderer every minute for nothing.
      rendererBusy: null,
    };
    if (!shouldAutoInstall({ ...signals, rendererBusy: false })) return;
    signals.rendererBusy = await askRendererBusy(win);
    if (!shouldAutoInstall(signals)) return;
    installing = true;
    logUpdate(
      `auto-install: app inactive (idle ${signals.idleS}s, floutée ${Math.round(signals.blurredMs / 60000)}min) — redémarrage pour installer`,
    );
    await quitAndInstallSafely();
  };

  const timer = setInterval(() => {
    void tick().catch(() => {
      installing = false; // an install failure reopens the window on the next tick
    });
  }, AUTO_POLL_MS);
  timer.unref?.();
}
