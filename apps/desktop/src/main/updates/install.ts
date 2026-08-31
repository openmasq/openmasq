import electronUpdater from "electron-updater";
import { logUpdate, logUpdateError } from "./log";
import { trackUpdateInstall } from "./track";

const { autoUpdater } = electronUpdater;

// The teardown that MUST complete before we hand off to ShipIt. The app re-spawns
// ITSELF as extra Electron instances (the agent browser + the @playwright/mcp server —
// same binary, so the same bundle id). Squirrel.Mac (ShipIt)
// refuses to swap the app bundle while it sees >1 running instance of the target
// ("App Still Running Error", SQRLInstaller Code=-9), and simply quitting main does NOT
// take those children with it — they get reparented to launchd and survive, so the
// update aborts and the app never relaunches (staying on the old version). The old
// teardown ran in `before-quit` but fire-and-forget, so `app.quit()` (fired by
// quitAndInstall) killed main before the children were even signalled. This hook is
// AWAITED before quitAndInstall so every child is gone first.
type BeforeInstall = () => Promise<void>;
let beforeInstall: BeforeInstall | null = null;

/** Register the pre-install teardown (kills the self-spawned Electron child instances). */
export function setBeforeInstall(fn: BeforeInstall): void {
  beforeInstall = fn;
}

function withTimeout(p: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms).unref?.())]);
}

/**
 * Tear down every self-spawned child Electron instance (awaited, bounded), THEN
 * `quitAndInstall`. Bounded by a timeout so a wedged child can't block the update
 * forever — the child killers themselves escalate to SIGKILL, so by the time we
 * hand off there should be exactly one instance of the bundle left (main).
 */
export async function quitAndInstallSafely(): Promise<void> {
  // Persist the attempt FIRST (a plain writeFileSync — no IPC, so it can't lose the race
  // with the quit below). The next launch turns it into `update_install` and tells us
  // whether the swap landed; a ShipIt failure is invisible from here.
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

/**
 * The SAME teardown, then a plain restart — for the environment switch.
 *
 * It lives here, not next to the switch, because the reason is identical and it
 * has only one home: the Electron instances the app re-spawns itself (agent
 * browser, @playwright/mcp server) do NOT die with main — they get reparented to
 * launchd and survive. Restarting without killing them would leave running children
 * holding the state of the OLD environment, while the new instance spawns
 * others. `relaunch` is injected so this module still never imports `app`.
 */
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
