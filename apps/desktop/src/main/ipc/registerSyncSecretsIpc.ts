import { ipcMain } from "electron";
import {
  getSyncPass,
  setSyncPass,
  setSyncPassUser,
  clearSyncPass,
  getDeviceSecret,
  setDeviceSecret,
} from "../store/syncPass";

/**
 * Les DEUX secrets de la synchro, exposés au renderer — regroupés ici plutôt qu'étalés
 * dans `index.ts` (règle 10 : la frontière de confiance se relit en famille, et celle-ci
 * a grandi le jour où le secret d'appareil a quitté le localStorage).
 *
 * - **La phrase** est la clé E2E qui déchiffre les coffres de tous les appareils du compte.
 * - **Le secret d'appareil** (TOFU) prouve au serveur que cet appareil est bien celui-là ;
 *   c'est ce qui ferme l'usurpation de replica, l'id étant publié par la liste des appareils.
 *
 * Les deux vivent chiffrés au repos (`safeStorage`, `store/syncPass.ts`) — jamais dans le
 * localStorage du renderer, qui est du LevelDB Chromium en clair sur le disque.
 *
 * ⚠️ Aucun `clear` pour le secret d'appareil : le perdre rend l'appareil INCONNU du serveur
 * (le hash stocké est celui de la première inscription et n'est jamais réécrit), ce qui
 * tuerait sa synchro sans recours. Ce n'est pas une action d'interface.
 */
export function registerSyncSecretsIpc(): void {
  // Le re-scope par compte. L'uid vient du renderer et finit dans un CHEMIN, donc il est
  // assaini côté magasin (`accountSecretFile` → `safeUid`) : rien d'exploitable ne survit,
  // et une valeur entièrement illégale vaut « déconnecté » (on n'écrit alors nulle part).
  ipcMain.handle("sync:set-user", (_e, uid: unknown) =>
    setSyncPassUser(typeof uid === "string" ? uid : null),
  );
  ipcMain.handle("sync:get-pass", () => getSyncPass());
  ipcMain.handle("sync:set-pass", (_e, value: string) => setSyncPass(value));
  ipcMain.handle("sync:clear-pass", () => clearSyncPass());
  ipcMain.handle("sync:get-device-secret", () => getDeviceSecret());
  ipcMain.handle("sync:set-device-secret", (_e, value: string) => setDeviceSecret(value));
}
