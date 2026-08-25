import { BrowserWindow, ipcMain, powerMonitor } from "electron";
import electronUpdater from "electron-updater";

import { quitAndInstallSafely } from "./install";
import { logUpdate } from "./log";

const { autoUpdater } = electronUpdater;

/**
 * L'installation AUTOMATIQUE d'un build téléchargé — quand l'app est en arrière-plan ou
 * que l'utilisateur est parti. Le modal « mise à jour prête » reste le chemin nominal ;
 * ceci est le rattrapage pour l'app qu'on ne redémarre jamais (ouverte des jours, la
 * mise à jour attendait un clic qui ne venait pas).
 *
 * FAIL-CLOSED partout : au moindre doute on ne redémarre PAS — un redémarrage rate au
 * pire une fenêtre d'installation (le prochain tick la retrouve), tandis qu'un
 * redémarrage pendant un tour agentique ou sur un brouillon non envoyé détruit du
 * travail (les brouillons sont mémoire-seulement, EXPRÈS — voir `state/CLAUDE.md`).
 * D'où les quatre gardes de `shouldAutoInstall` ET la sonde renderer : main demande
 * « es-tu quiescent ? » au moment de décider (tour en vol ? brouillon quelque part ?) et
 * traite l'absence de réponse comme « occupé ».
 */
const AUTO_POLL_MS = 60_000;
/** L'utilisateur est PARTI : aucune entrée système depuis 10 min (powerMonitor). */
export const AUTO_IDLE_AWAY_S = 10 * 60;
/** L'app est en ARRIÈRE-PLAN prolongé : floutée sans interruption depuis 30 min.
 *  Plus long que l'absence : l'utilisateur travaille peut-être À CÔTÉ, et le relaunch
 *  post-installation vole le premier plan — on ne le paie pas pour un détour de 5 min. */
export const AUTO_BLURRED_MS = 30 * 60_000;
/** La sonde renderer répond vite ou pas du tout (renderer occupé/mort ⇒ occupé). */
const QUIESCENCE_TIMEOUT_MS = 3_000;

export interface AutoInstallSignals {
  /** Un build est posé (update-downloaded reçu, pas d'échec de pose depuis). */
  staged: boolean;
  /** Une fenêtre de l'app a le focus OS. */
  focused: boolean;
  /** Secondes depuis la dernière entrée utilisateur, SYSTÈME entier. */
  idleS: number;
  /** Depuis combien de temps l'app est floutée sans interruption (0 si focus). */
  blurredMs: number;
  /** Flux de conversation en vol côté MAIN (ceinture — le renderer le sait aussi). */
  mainBusy: boolean;
  /** Réponse de la sonde renderer. `null` = pas de réponse ⇒ OCCUPÉ (fail-closed). */
  rendererBusy: boolean | null;
}

/** La décision, pure (testée) : arrière-plan prolongé OU utilisateur parti — et rien en
 *  vol nulle part. Chaque condition qui doute refuse. */
export function shouldAutoInstall(s: AutoInstallSignals): boolean {
  if (!s.staged || s.focused || s.mainBusy) return false;
  if (s.rendererBusy !== false) return false;
  return s.idleS >= AUTO_IDLE_AWAY_S || s.blurredMs >= AUTO_BLURRED_MS;
}

/** Demande au renderer s'il est quiescent (aucun envoi en vol, aucun brouillon).
 *  Silence/erreur ⇒ `null` (l'appelant lit ça « occupé »). */
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
 * Arme la minuterie. `mainBusy` est injecté (la carte des flux `chat:*` vit dans
 * `index.ts`) ; l'état « posé » s'écoute ici même : `update-downloaded` l'arme,
 * une `error` d'après-téléchargement le désarme (la pose a échoué, `poll.ts` rejoue).
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
      // Demandée en DERNIER, seulement si le reste est déjà réuni — pas de ping du
      // renderer toutes les minutes pour rien.
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
      installing = false; // un échec de pose rouvre la fenêtre au tick suivant
    });
  }, AUTO_POLL_MS);
  timer.unref?.();
}
