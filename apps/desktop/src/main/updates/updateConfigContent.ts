/** Le YAML reconstruit d'`app-update.yml` — PUR (aucun import Electron), pour être
 *  testable et importé des deux côtés. Chaque VALEUR a sa maison chez l'appelant ;
 *  la FORME reproduit celle qu'electron-builder génère. ⚠️ Copie assumée de
 *  `scripts/appUpdateYml.cjs` (un module CJS de build ne s'importe pas du bundle
 *  main) — parité tenue par `appUpdateConfig.test.ts`, qui lit les DEUX. */
export function rebuiltUpdateConfigContent(url: string, channel: string, productName: string): string {
  return [
    "provider: generic",
    `url: ${url}`,
    `channel: ${channel}`,
    `updaterCacheDirName: ${productName.toLowerCase()}-updater`,
    "",
  ].join("\n");
}
