import * as electron from "electron";

/**
 * Les DevTools n'existent PAS dans l'app empaquetée — sur aucune fenêtre.
 *
 * Sans ce verrou ils étaient réellement atteignables : l'app ne pose aucun menu
 * applicatif, donc Electron livre son menu PAR DÉFAUT, « Toggle Developer Tools »
 * compris — un item de barre de menus, pas un raccourci de connaisseur. Ouverts sur la
 * fenêtre principale, ils donnent la console du renderer, c'est-à-dire `window.openmasq`
 * (la surface IPC entière) en accès interactif, plus le débogueur sur notre bundle.
 *
 * Ce que ça protège, et ce que ça ne protège pas : c'est un verrou d'INTROSPECTION À
 * CHAUD, le pendant côté Chromium des fusibles qui coupent déjà `--inspect` et
 * `NODE_OPTIONS` côté Node (`scripts/afterPack.cjs`). Le code au repos reste lisible
 * dans l'asar — ce n'est pas le sujet, et rien ici ne prétend l'empêcher.
 *
 * `devTools: false` rend `openDevTools()` ET l'item de menu inertes sur la fenêtre qui
 * le porte. La clé vaut par fenêtre, donc UNE maison et six spreads — une fenêtre créée
 * sans lui retomberait sur le défaut d'Electron (`true`) sans que rien ne rougisse.
 *
 * En dev, tout reste ouvert : `index.ts` ouvre les DevTools au lancement, et le débogage
 * du navigateur agent en a besoin. ⚠️ Ne pas confondre avec le CDP de Playwright
 * (`--remote-debugging-*`) : les e2e pilotent l'app CONSTRUITE par ce canal-là, que cette
 * préférence ne touche pas.
 */
// Import d'ESPACE DE NOMS, et pas `{ app }` : les tests unitaires mockent `electron`
// PARTIELLEMENT, et vitest refuse un export nommé absent du mock À L'IMPORT — ce module
// est tiré par leurs chaînes d'import. Via l'espace de noms, un mock sans `app` donne
// `undefined` (donc « jamais empaqueté », la même réponse qu'en dev : DevTools permis).
export const DEVTOOLS_PREF = Object.freeze({ devTools: !electron.app?.isPackaged });
