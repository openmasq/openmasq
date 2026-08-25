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
 * Le MÊME démontage, puis un simple redémarrage — pour la bascule d'environnement.
 *
 * Il vit ici, et pas à côté de la bascule, parce que la raison est identique et qu'elle
 * n'a qu'une maison : les instances Electron que l'app se re-lance à elle-même (navigateur
 * agent, serveur @playwright/mcp) ne meurent PAS avec main — elles sont ré-parentées à
 * launchd et survivent. Redémarrer sans les tuer laisserait tourner des enfants qui
 * détiennent l'état de l'ANCIEN environnement, pendant que la nouvelle instance en spawn
 * d'autres. Le `relaunch` est injecté pour que ce module n'importe toujours pas `app`.
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
