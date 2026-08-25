import electronUpdater from "electron-updater";

import { logUpdate } from "./log";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

// WHEN we ask the feed. A desktop app stays open for days, so a launch-only check made
// the restart the unit of update latency: the Worker's rollout — and, more importantly,
// a ROLLBACK — only reached an install when its user happened to relaunch. Re-asking on
// a timer makes a server-side rule effective within one interval instead. 15 min is the
// cost of a manifest GET on the Worker (~96/day/install, no download unless the version
// actually moved) against how long a bad release keeps reaching people.
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
 * Own the DOWNLOAD promise electron-updater hands back — nobody else does.
 *
 * `AppUpdater.downloadUpdate` re-throws after emitting `error`, so the promise it stores
 * always rejects on failure; `checkForUpdates()` returns it untouched. An unowned
 * rejection in MAIN becomes an `unhandledRejection`, i.e. a SECOND exception
 * (`uncaught/main-rejection`) for a failure the `error` event has already reported with
 * its code and context — measured on 0.4.1-staging, where the ditto/lstat apply failure
 * arrived twice in PostHog, the duplicate carrying no context at all.
 *
 * The `error` event stays the ONE reporting path. This only stops the duplicate from
 * escaping the process.
 */
export function ownDownloadPromise(res: { downloadPromise?: Promise<unknown> | null } | null | undefined): void {
  res?.downloadPromise?.catch(() => {});
}

function tick(reason: string): void {
  if (!shouldCheck(state)) return;
  logUpdate(`${reason} check`);
  // The feed URL is NOT re-applied here on purpose: `updates:set-channel` / `pin` /
  // `switch` already own it, and re-pointing it at <channel>/latest under a tick would
  // silently undo a pin the user just asked for.
  //
  // ⚠️ `checkForUpdates`, NOT `checkForUpdatesAndNotify`: the latter attaches a bare
  // `.then()` to the download promise, so ITS derived promise rejects unowned inside the
  // library — unreachable from here — and it pops a native "update downloaded"
  // notification, the very OS-level announcement this app deliberately removed (the
  // renderer announces, with the release note).
  autoUpdater
    .checkForUpdates()
    .then(ownDownloadPromise)
    .catch(() => {
      // The `error` event owns the log + the telemetry; a rejected check must not throw here.
    });
}

/** (Re)arm the interval. Separate from the listener wiring so a re-arm after a failed
 *  staged install doesn't stack a second set of listeners on the updater. */
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

/**
 * The launch check + the periodic re-check. Call once, LAST in
 * `setupAutoUpdates` — it registers its own listeners on top of the log/status/telemetry
 * ones so the busy/downloaded state stays local to this module.
 */
export function startUpdateChecks(everyMs: number = CHECK_INTERVAL_MS): void {
  stopUpdateChecks();
  intervalMs = everyMs;
  state.busy = false;
  state.downloaded = false;

  autoUpdater.on("checking-for-update", () => {
    state.busy = true;
  });
  // A download follows only when autoDownload is on; otherwise the check is over and a
  // later tick must not stay blocked forever on a stale busy flag.
  autoUpdater.on("update-available", () => {
    state.busy = autoUpdater.autoDownload;
  });
  autoUpdater.on("update-not-available", () => {
    state.busy = false;
  });
  autoUpdater.on("error", () => {
    state.busy = false;
    // An error AFTER a build was staged means the staged build did NOT apply (ShipIt's
    // ditto step, a vanished cache file, a refused swap). `update-downloaded` had made
    // the loop terminal, so the app then never re-checked: the machine stayed on the old
    // version until someone happened to relaunch it, and the same broken staging was
    // reused. A failed apply voids the terminal state — re-open the loop so the next
    // tick can fetch the build again.
    if (state.downloaded) {
      logUpdate("staged build failed to apply — re-opening the update loop");
      state.downloaded = false;
      armTimer();
    }
  });
  // Terminal: the build is staged for ShipIt. Further checks can only churn the feed —
  // and a second staged download while one is pending is exactly what ShipIt dislikes.
  autoUpdater.on("update-downloaded", () => {
    state.busy = false;
    state.downloaded = true;
    stopUpdateChecks();
  });

  tick("launch");
  armTimer();
}
