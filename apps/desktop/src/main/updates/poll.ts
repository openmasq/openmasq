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
}

/**
 * Pure: the whole decision, so the gate is testable without a timer or a network. A STAGED
 * build no longer closes it: the loop used to stop at `update-downloaded`, so an install that
 * stayed open past the next release installed the build it had staged days before — one
 * restart behind, every time (seen: 0.11.2 → 0.13.0 the day after 0.15.0 shipped).
 */
export function shouldCheck(g: CheckGate): boolean {
  return !g.busy;
}

/**
 * Should a build the feed announces be DOWNLOADED, given the one staged? Only a DIFFERENT
 * version (a newer release — or the exact one a pin asked for): re-feeding the SAME staged
 * build would hand the installer the same ~500 MB again at every check. Pure, tested.
 */
export function replacesStaged(found: string | undefined, staged: string | null): boolean {
  if (staged === null) return true;
  return !!found && found !== staged;
}

/**
 * A check or a download with NO SIGN OF LIFE for this long is stalled. `busy` is cleared only
 * by an updater event; a request that hangs (sleep, a network change mid-request) sends none,
 * and every later tick was skipped until the app relaunched — an install open for days stopped
 * asking the feed (seen on 0.11.2). A download's progress events are signs of life, so a slow
 * connection is never mistaken for a stall.
 */
export const STALL_MS = 10 * 60 * 1000;

/** Pure: is the in-flight check/download stalled at `now`? */
export function isStalled(s: { busy: boolean; lastAlive: number }, now: number): boolean {
  return s.busy && now - s.lastAlive >= STALL_MS;
}

const state = { busy: false, lastAlive: 0, staged: null as string | null };

/** Is `found` the build already staged? Then a re-check announcing it is NOT a new download:
 *  the status stream must keep saying « ready to install », not « downloading » forever. */
export const isStaged = (found: string | undefined): boolean =>
  state.staged !== null && !replacesStaged(found, state.staged);
let timer: ReturnType<typeof setInterval> | null = null;
let intervalMs = CHECK_INTERVAL_MS;
/** Cancels the download the last check started (its CancellationToken), if any. */
let cancelInFlight: (() => void) | null = null;
let onStall: (() => void) | null = null;

const alive = (): void => {
  state.lastAlive = Date.now();
};

/**
 * Re-open the loop after a stall. ⚠️ Clearing `busy` is not enough: electron-updater hands a
 * pending check's promise back to every later `checkForUpdates()` (`AppUpdater.js`, its
 * `checkForUpdatesPromise`), so a hung check would be "re-asked" without a single request.
 * The cached promise is dropped, the hung download cancelled. The field's name is pinned
 * against the installed library by `poll.test.ts`.
 */
function releaseStall(): void {
  logUpdate("update check/download stalled — re-opening the update loop");
  try {
    cancelInFlight?.();
  } catch {
    /* already settled */
  }
  cancelInFlight = null;
  (autoUpdater as unknown as { checkForUpdatesPromise: unknown }).checkForUpdatesPromise = null;
  state.busy = false;
  onStall?.();
}

/**
 * Own the DOWNLOAD promise electron-updater hands back: it rejects on failure after the
 * `error` event already reported it, and an unowned rejection in MAIN is a SECOND,
 * context-less exception. The `error` event stays the ONE reporting path.
 */
export function ownDownloadPromise(res: { downloadPromise?: Promise<unknown> | null } | null | undefined): void {
  res?.downloadPromise?.catch(() => {});
}

function tick(reason: string): void {
  if (isStalled(state, Date.now())) releaseStall();
  if (!shouldCheck(state)) return;
  logUpdate(`${reason} check`);
  // The feed URL is NOT re-applied here: a tick would undo a pin the user just asked for.
  // ⚠️ `checkForUpdates`, NOT `checkForUpdatesAndNotify`: the latter leaves an unowned
  // rejection inside the library and pops a native notification the renderer replaces.
  autoUpdater
    .checkForUpdates()
    .then((res) => {
      const token = res?.cancellationToken;
      cancelInFlight = token ? () => token.cancel() : null;
      ownDownloadPromise(res);
    })
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

/** The launch check + the periodic re-check. Call once, LAST in `setupAutoUpdates`.
 *  `hooks.onStall`: told when a stalled check/download is released (telemetry). */
export function startUpdateChecks(everyMs: number = CHECK_INTERVAL_MS, hooks?: { onStall?: () => void }): void {
  stopUpdateChecks();
  intervalMs = everyMs;
  state.busy = false;
  state.staged = null;
  onStall = hooks?.onStall ?? null;

  autoUpdater.on("checking-for-update", () => {
    state.busy = true;
    alive();
  });
  // Nothing staged: autoDownload is on and the download follows. A build staged: the check
  // runs with autoDownload OFF and the download is decided here, for a different version only.
  autoUpdater.on("update-available", (info?: { version?: string }) => {
    alive();
    if (state.staged === null) {
      state.busy = autoUpdater.autoDownload;
      return;
    }
    if (!replacesStaged(info?.version, state.staged)) {
      state.busy = false;
      return;
    }
    logUpdate(`v${info?.version} supersedes the staged v${state.staged} — downloading it`);
    state.busy = true;
    autoUpdater.downloadUpdate().catch(() => {
      // The `error` event owns the log + the telemetry.
    });
  });
  // A download that moves is alive, however long it takes.
  autoUpdater.on("download-progress", alive);
  autoUpdater.on("update-not-available", () => {
    state.busy = false;
  });
  autoUpdater.on("error", () => {
    // An error with a check or download IN FLIGHT is that request's (offline, a 500): the
    // staged build is untouched. One with NOTHING in flight while a build is staged is the
    // staged build failing to apply: forget it, so the next check fetches one again.
    const applyFailed = !state.busy && state.staged !== null;
    state.busy = false;
    if (applyFailed) {
      logUpdate("staged build failed to apply — the next check fetches it again");
      state.staged = null;
      autoUpdater.autoDownload = true;
    }
  });
  // Staged: keep checking, with autoDownload OFF so the same build is not re-fed to the
  // installer at every tick; a DIFFERENT version is downloaded explicitly (`update-available`).
  autoUpdater.on("update-downloaded", (info?: { version?: string }) => {
    state.busy = false;
    state.staged = info?.version ?? state.staged ?? "unknown";
    autoUpdater.autoDownload = false;
  });

  tick("launch");
  armTimer();
}
