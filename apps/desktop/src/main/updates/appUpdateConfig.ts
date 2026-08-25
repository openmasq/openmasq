import { app } from "electron";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import electronUpdater from "electron-updater";
import { DEFAULT_CHANNEL, feedBase, getConfig } from "./config";
import { rebuiltUpdateConfigContent } from "./updateConfigContent";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

/**
 * L'auto-réparation d'`app-update.yml` — la défense en profondeur du bundle.
 *
 * electron-updater lit ce fichier même quand `setFeedURL` a remplacé l'URL (il y prend
 * `updaterCacheDirName`) : absent, CHAQUE vérification meurt en ENOENT et l'install ne
 * reçoit plus jamais rien. C'est arrivé — la 0.6.0 macOS est partie sans lui (pipeline
 * scindé `--dir`/`--prepackaged`), et ses utilisateurs doivent réinstaller à la main.
 * L'empaquetage est corrigé ET verrouillé (`scripts/afterPack.cjs`, l'assertion de
 * `mac-release.ts`) ; ce module couvre la CLASSE du défaut plutôt que l'instance : si
 * un futur pipeline relivre un bundle sans le fichier, l'app reconstruit l'équivalent
 * dans `userData` et pointe electron-updater dessus (`updateConfigPath`, setter public).
 *
 * ⚠️ Se répare ET se SIGNALE, dans cet ordre d'importance : la réparation garde le parc
 * à jour, mais un bundle amputé est une régression d'empaquetage que quelqu'un doit
 * voir — d'où le rapport `updater-config-missing`, même quand la guérison réussit.
 * Écrire dans le bundle lui-même est exclu : il est signé, tout ajout casse le sceau.
 */


/**
 * À appeler AVANT le premier `checkForUpdates`. Rend le code de rapport à émettre
 * (`config-missing`) quand le bundle est amputé, `null` quand tout va bien — le rapport
 * lui-même reste chez l'appelant, qui détient l'injecteur de télémétrie.
 */
export function ensureUpdateConfigFile(): { healed: boolean; detail: string } | null {
  if (!app.isPackaged) return null; // en dev il n'y a pas de bundle, et pas de mise à jour
  const bundled = join(process.resourcesPath, "app-update.yml");
  if (existsSync(bundled)) return null;
  const healed = join(app.getPath("userData"), "app-update.yml");
  try {
    // L'URL du fichier n'est qu'un repli (`applyFeed` la remplace à chaque check) ;
    // `updaterCacheDirName` est le champ qui compte, et il se dérive du nom produit.
    writeFileSync(
      healed,
      rebuiltUpdateConfigContent(feedBase(getConfig().channel || DEFAULT_CHANNEL), "latest", app.getName()),
    );
    autoUpdater.updateConfigPath = healed;
    return { healed: true, detail: `app-update.yml absent du bundle — reconstruit dans userData` };
  } catch (err) {
    // Même l'échec de la réparation se dit : l'install est alors réellement orpheline.
    return {
      healed: false,
      detail: `app-update.yml absent du bundle et reconstruction impossible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
