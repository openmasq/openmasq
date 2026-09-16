import electronUpdater from "electron-updater";
import { logUpdate, logUpdateError } from "./log";
import { trackUpdateInstall } from "./track";

const { autoUpdater } = electronUpdater;

// The teardown that MUST complete before the hand-off: the app re-spawns ITSELF as extra
// Electron instances (same bundle id), the installer refuses to swap while it sees >1
// instance, and quitting main does NOT take the children along (reparented to launchd).
// AWAITED before quitAndInstall.
type BeforeInstall = () => Promise<void>;
let beforeInstall: BeforeInstall | null = null;

/** Register the pre-install teardown (kills the self-spawned Electron child instances). */
export function setBeforeInstall(fn: BeforeInstall): void {
  beforeInstall = fn;
}

function withTimeout(p: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms).unref?.())]);
}

/** Tear down every self-spawned child (awaited, bounded so a wedged child can't block the
 *  update), THEN `quitAndInstall`. */
export async function quitAndInstallSafely(): Promise<void> {
  // Persist the attempt FIRST (sync write, no IPC race with the quit): the next launch
  // tells whether the swap landed.
  trackUpdateInstall();
  if (beforeInstall) {
    try {
      await withTimeout(beforeInstall(), 10_000);
      logUpdate("pre-install teardown complete — handing off to ShipIt");
    } catch (err) {
      logUpdateError("pre-install-teardown", err);
    }
  }
  autoUpdater.quitAndInstall();
}

/** The SAME teardown, then a plain restart (the environment switch): children left alive
 *  would hold the OLD environment's state. `relaunch` injected so `app` is never imported. */
export async function relaunchSafely(relaunchAndQuit: () => void): Promise<void> {
  if (beforeInstall) {
    try {
      await withTimeout(beforeInstall(), 10_000);
      logUpdate("pre-relaunch teardown complete");
    } catch (err) {
      logUpdateError("pre-relaunch-teardown", err);
    }
  }
  relaunchAndQuit();
}
