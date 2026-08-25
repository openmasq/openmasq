/**
 * `electron`, vu par la SUITE UNITAIRE — un bouchon, jamais le vrai paquet.
 *
 * ⚠️ Le vrai `electron/index.js` ne rend pas une API : il rend le CHEMIN du binaire, et si
 * `path.txt` manque il TÉLÉCHARGE 295 Mo à l'import. En local le binaire est là, donc rien
 * ne se voit ; sur un runner il ne l'est pas, et le premier fichier de test qui touche
 * `electron` paie le téléchargement AU MILIEU de la suite. Vécu le 12/08 : `fetch failed`,
 * « Electron failed to install correctly », un fichier rouge sur 647 — et deux minutes plus
 * tard un AUTRE fichier qui importe le même module passait au vert. Ce n'était donc pas un
 * test cassé mais une COURSE, que seule la chance arbitrait, et qu'aucun `pnpm test` local
 * ne pouvait montrer.
 *
 * L'alias (`vitest.config.ts`) supprime la course en supprimant sa cause : plus rien de la
 * suite ne résout le vrai paquet, donc plus de réseau, et le local et la CI voient
 * exactement la même chose.
 *
 * Ce que le bouchon N'EST PAS : une API d'Electron. Chaque nom rend un objet qui JETTE au
 * premier accès, avec la marche à suivre. Un test qui a besoin d'un comportement le déclare,
 * comme les 21 fichiers qui le font déjà (`vi.mock("electron", …)`, qui gagne sur cet alias).
 * Un import qui n'était qu'incident — le cas de `webFetchMany` — ne coûte rien : personne ne
 * touche l'objet, donc rien ne jette.
 */

function absent(name: string): unknown {
  const boom = (prop: string): never => {
    throw new Error(
      `electron.${name}.${prop} — la suite unitaire n'a PAS Electron (bouchon : ` +
        `scripts/vitest.electron-stub.ts). Déclarez ce dont ce test a besoin :\n` +
        `  vi.mock("electron", () => ({ ${name}: { ${prop}: vi.fn() } }));`,
    );
  };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        // `then` est interrogé par tout `await` : jeter ici transformerait un simple
        // `await import(...)` en échec illisible. Un module n'est pas une promesse.
        if (prop === "then" || typeof prop === "symbol") return undefined;
        return boom(String(prop));
      },
    },
  );
}

/** `app` fait EXCEPTION sur son cycle de vie : enregistrer un écouteur au chargement du
 *  module (`app.on("before-quit", …)` — `runtime/quitState.ts`) est un motif Electron
 *  normal, pas un comportement qu'un test affirme. Jeter là obligerait chaque test qui
 *  importe transitivement un fichier main à mocker electron pour rien. Les écouteurs
 *  sont avalés ; tout le RESTE d'`app` garde le contrat « jette en dictant le vi.mock ». */
const APP_LIFECYCLE = new Set(["on", "once", "off", "removeListener", "addListener"]);
const appBase = absent("app") as Record<PropertyKey, unknown>;
export const app = new Proxy(
  {},
  {
    get(_t, prop) {
      if (typeof prop === "string" && APP_LIFECYCLE.has(prop)) return () => app;
      return appBase[prop as string];
    },
  },
);
export const BrowserWindow = absent("BrowserWindow");
export const ipcMain = absent("ipcMain");
export const ipcRenderer = absent("ipcRenderer");
export const contextBridge = absent("contextBridge");
export const dialog = absent("dialog");
export const shell = absent("shell");
export const session = absent("session");
export const clipboard = absent("clipboard");
export const Menu = absent("Menu");
export const Notification = absent("Notification");
export const safeStorage = absent("safeStorage");
export const systemPreferences = absent("systemPreferences");
export const utilityProcess = absent("utilityProcess");
export const webFrame = absent("webFrame");
export const webUtils = absent("webUtils");

export default {
  app,
  BrowserWindow,
  ipcMain,
  ipcRenderer,
  contextBridge,
  dialog,
  shell,
  session,
  clipboard,
  Menu,
  Notification,
  safeStorage,
  systemPreferences,
  utilityProcess,
  webFrame,
  webUtils,
};
