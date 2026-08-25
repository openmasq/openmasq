import { app } from "electron";
import { isAbsolute } from "node:path";

// ── Où se trouve CETTE app, pour un enfant qui doit la relancer ──────────────
// Deux consommateurs re-spawnent ce binaire en mode helper (navigateur agent,
// @playwright/mcp) et un troisième déclare l'entrée dev à LaunchServices. Tous
// les trois ont besoin du MÊME fait — le chemin de l'app — et aucun ne peut le
// dériver de son propre processus :
//
//   • `require.main.filename` vaut le littéral « electron » dans le processus
//     main d'Electron (mesuré : le bootstrap d'Electron est le module main, pas
//     l'entrée de l'app). Spawné tel quel, l'enfant résout « electron » CONTRE
//     SON CWD, ne trouve rien, et ouvre un dialogue natif « Unable to find
//     Electron app at …/apps/desktop/electron » — modal, donc l'enfant ne rend
//     jamais la main et le `pnpm dev` / le run Playwright ne se termine plus.
//   • `process.argv[1]` vaut « . » sous `electron-vite dev` : correct seulement
//     tant que l'enfant hérite du cwd du lanceur, et faux dès qu'on lance depuis
//     la racine du dépôt.
//
// `app.getAppPath()` est le seul qui soit absolu et indépendant du cwd.

/** Pure part, so the regression above is pinnable without an Electron runtime. */
export function helperEntryArgs(packaged: boolean, appPath: string): string[] {
  // Packaged: execPath EST l'app, l'entrée bundlée se charge seule (et un
  // Electron packagé IGNORE de toute façon une entrée en argv).
  if (packaged) return [];
  // Fail closed: mieux vaut un spawn qui échoue avec un message qu'un enfant
  // bloqué sur un dialogue natif que personne ne peut fermer en CI.
  if (!isAbsolute(appPath)) {
    throw new Error(`helper spawn: chemin d'app non absolu (${appPath})`);
  }
  return [appPath];
}

/** Argv to hand a child Electron so it re-enters THIS app (helper modes). */
export function helperSpawnArgs(): string[] {
  return helperEntryArgs(app.isPackaged, app.getAppPath());
}
