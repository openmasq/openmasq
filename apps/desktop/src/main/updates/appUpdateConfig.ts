import { app } from "electron";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import electronUpdater from "electron-updater";
import { DEFAULT_CHANNEL, feedBase, getConfig } from "./config";
import { rebuiltUpdateConfigContent } from "./updateConfigContent";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

/**
 * The auto-repair of `app-update.yml` — the bundle's defence in depth.
 *
 * electron-updater reads this file even when `setFeedURL` has replaced the URL (it takes
 * `updaterCacheDirName` from it): absent, EVERY check dies with ENOENT and the install
 * never receives anything again. It happened — 0.6.0 macOS shipped without it (a
 * pipeline split into `--dir`/`--prepackaged`), and its users have to reinstall by hand.
 * Packaging is fixed AND locked down (`scripts/afterPack.cjs`, the assertion in
 * `mac-release.ts`); this module covers the CLASS of the bug rather than the instance: if
 * a future pipeline ships a bundle without the file again, the app rebuilds the equivalent
 * in `userData` and points electron-updater at it (`updateConfigPath`, a public setter).
 *
 * ⚠️ Repairs itself AND reports itself, in that order of importance: the repair keeps the
 * fleet up to date, but an amputated bundle is a packaging regression someone must
 * see — hence the `updater-config-missing` report, even when the healing succeeds.
 * Writing into the bundle itself is out of the question: it's signed, any addition breaks the seal.
 */


/**
 * To call BEFORE the first `checkForUpdates`. Returns the report code to emit
 * (`config-missing`) when the bundle is amputated, `null` when all is well — the report
 * itself stays with the caller, who holds the telemetry injector.
 */
export function ensureUpdateConfigFile(): { healed: boolean; detail: string } | null {
  if (!app.isPackaged) return null; // in dev there's no bundle, and no update
  const bundled = join(process.resourcesPath, "app-update.yml");
  if (existsSync(bundled)) return null;
  const healed = join(app.getPath("userData"), "app-update.yml");
  try {
    // The file's URL is only a fallback (`applyFeed` replaces it on every check);
    // `updaterCacheDirName` is the field that matters, and it derives from the product name.
    writeFileSync(
      healed,
      rebuiltUpdateConfigContent(feedBase(getConfig().channel || DEFAULT_CHANNEL), "latest", app.getName()),
    );
    autoUpdater.updateConfigPath = healed;
    return { healed: true, detail: `app-update.yml absent du bundle — reconstruit dans userData` };
  } catch (err) {
    // Even the repair's failure is reported: the install is then genuinely orphaned.
    return {
      healed: false,
      detail: `app-update.yml absent du bundle et reconstruction impossible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
