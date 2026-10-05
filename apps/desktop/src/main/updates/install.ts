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

/** The pre-install teardown, awaited and bounded so a wedged child can't block the update. */
async function teardown(label: string): Promise<void> {
  if (!beforeInstall) return;
  try {
    await withTimeout(beforeInstall(), 10_000);
    logUpdate(`${label} teardown complete`);
  } catch (err) {
    logUpdateError(`${label}-teardown`, err);
  }
}

/** The quit that installs is under way: a `before-quit` must not intercept it again. */
let handedOff = false;

/** Tear down every self-spawned child, THEN `quitAndInstall`. */
export async function quitAndInstallSafely(): Promise<void> {
  handedOff = true;
  // Persist the attempt FIRST (sync write, no IPC race with the quit): the next launch
  // tells whether the swap landed.
  trackUpdateInstall();
  await teardown("pre-install");
  autoUpdater.quitAndInstall();
}

/** The slice of Electron's `app` the quit-install needs — injected, `app` is never imported. */
export interface QuitApp {
  on(event: "before-quit", listener: (e: { preventDefault(): void }) => void): void;
  quit(): void;
}

/**
 * A plain QUIT (⌘Q, the last window on Windows) with a build staged: the installer applies it
 * as the app exits (`autoInstallOnAppQuit`) — but the self-spawned children were stopped
 * fire-and-forget (`before-quit` in `index.ts`), still alive when the installer looked, so it
 * refused the swap (« App Still Running ») and the app came back on the OLD version, downloading
 * the same build again at every launch (seen on 0.11.2: twelve downloads, no install). Hold
 * that quit once: record the attempt, AWAIT the same teardown as the restart button, then quit.
 */
export function installOnQuit(app: QuitApp): void {
  let staged = false;
  autoUpdater.on("update-downloaded", () => {
    staged = true;
  });
  autoUpdater.on("error", () => {
    staged = false;
  });
  app.on("before-quit", (e) => {
    if (handedOff || !staged || !autoUpdater.autoInstallOnAppQuit) return;
    e.preventDefault();
    handedOff = true;
    trackUpdateInstall();
    void teardown("pre-quit-install").finally(() => app.quit());
  });
}

/** Tests only: a fresh process. */
export function resetInstallState(): void {
  handedOff = false;
}

/** The SAME teardown, then a plain restart (the environment switch): children left alive
 *  would hold the OLD environment's state. `relaunch` injected so `app` is never imported. */
export async function relaunchSafely(relaunchAndQuit: () => void): Promise<void> {
  await teardown("pre-relaunch");
  relaunchAndQuit();
}
