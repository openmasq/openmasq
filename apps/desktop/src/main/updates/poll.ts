import electronUpdater from "electron-updater";

import { logUpdate } from "./log";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

// WHEN we ask the feed. An app stays open for days: a launch-only check would make the
// restart the unit of update latency, and a ROLLBACK would wait for it. One manifest GET
// per interval against how long a bad release keeps reaching people.
export const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 min

/** What a background tick has to look at before spending an HTTP call. */
export interface CheckGate {
  /** A check or a download is already in flight — a second one would race it. */
  busy: boolean;
  /** A build is staged and waiting on the restart prompt; nothing left to check for. */
  downloaded: boolean;
}

/** Pure: the whole decision, so the gate is testable without a timer or a network. */
export function shouldCheck(g: CheckGate): boolean {
  return !g.busy && !g.downloaded;
}

const state = { busy: false, downloaded: false };
let timer: ReturnType<typeof setInterval> | null = null;
let intervalMs = CHECK_INTERVAL_MS;

/**
 * Own the DOWNLOAD promise electron-updater hands back: it rejects on failure after the
 * `error` event already reported it, and an unowned rejection in MAIN is a SECOND,
 * context-less exception. The `error` event stays the ONE reporting path.
 */
export function ownDownloadPromise(res: { downloadPromise?: Promise<unknown> | null } | null | undefined): void {
  res?.downloadPromise?.catch(() => {});
}

function tick(reason: string): void {
  if (!shouldCheck(state)) return;
  logUpdate(`${reason} check`);
  // The feed URL is NOT re-applied here: a tick would undo a pin the user just asked for.
  // ⚠️ `checkForUpdates`, NOT `checkForUpdatesAndNotify`: the latter leaves an unowned
  // rejection inside the library and pops a native notification the renderer replaces.
  autoUpdater
    .checkForUpdates()
    .then(ownDownloadPromise)
    .catch(() => {
      // The `error` event owns the log + the telemetry; a rejected check must not throw here.
    });
}

/** (Re)arm the interval, separate from the listeners so a re-arm doesn't stack them. */
function armTimer(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => tick("periodic"), intervalMs);
  timer.unref?.();
}

/** Stop the timer (used on the terminal state, and by the tests). */
export function stopUpdateChecks(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** The launch check + the periodic re-check. Call once, LAST in `setupAutoUpdates`. */
export function startUpdateChecks(everyMs: number = CHECK_INTERVAL_MS): void {
  stopUpdateChecks();
  intervalMs = everyMs;
  state.busy = false;
  state.downloaded = false;

  autoUpdater.on("checking-for-update", () => {
    state.busy = true;
  });
  // A download follows only when autoDownload is on; otherwise the check is over.
  autoUpdater.on("update-available", () => {
    state.busy = autoUpdater.autoDownload;
  });
  autoUpdater.on("update-not-available", () => {
    state.busy = false;
  });
  autoUpdater.on("error", () => {
    state.busy = false;
    // An error AFTER a build was staged means it did NOT apply: void the terminal state
    // and re-open the loop, or the machine stays on the old version until a relaunch.
    if (state.downloaded) {
      logUpdate("staged build failed to apply — re-opening the update loop");
      state.downloaded = false;
      armTimer();
    }
  });
  // Terminal: the build is staged. A second staged download is what the installer dislikes.
  autoUpdater.on("update-downloaded", () => {
    state.busy = false;
    state.downloaded = true;
    stopUpdateChecks();
  });

  tick("launch");
  armTimer();
}
