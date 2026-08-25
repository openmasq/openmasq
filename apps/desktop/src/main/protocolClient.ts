import { app } from "electron";
import { existsSync } from "node:fs";
import { protocolAction } from "./deepLink";

/**
 * S'annoncer (ou non) au système comme handler du schéma de deep-link de l'app.
 *
 * Un module à part parce que l'enregistrement LaunchServices est PERSISTANT : il survit à
 * l'arrêt du processus, et une déclaration fantaisiste se paie longtemps après. La RÈGLE
 * (qui a le droit) est pure et testée dans `deepLink.ts` ; ici il ne reste que l'appel
 * Electron et la résolution du chemin d'app.
 *
 * ⚠️ `app.getAppPath()` et jamais argv (« . » sous electron-vite dev, donc résolu contre le
 * cwd du LANCEUR) : même fait, même source qu'`appEntry.ts`.
 */
export function registerProtocolClient(scheme: string): void {
  const entry = process.defaultApp ? app.getAppPath() : null;
  const devEntry = entry && existsSync(entry) ? entry : null;
  const action = protocolAction({
    packaged: !process.defaultApp,
    platform: process.platform,
    devEntry,
  });
  if (action === "register") {
    if (devEntry) app.setAsDefaultProtocolClient(scheme, process.execPath, [devEntry]);
    else app.setAsDefaultProtocolClient(scheme);
  } else if (action === "unregister") {
    // Répare la machine du développeur : l'enregistrement volé par un `pnpm dev` précédent
    // (souvent celui d'un AUTRE worktree) est retiré au lancement suivant.
    app.removeAsDefaultProtocolClient(scheme);
  }
}
