import { app, dialog, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";

import { APPLY_SPACE_FACTOR, fmtGB, freeBytes, totalUpdateSize } from "./disk";
import { logUpdate, logUpdateError } from "./log";
import { reportUpdateFailure } from "./report";
import { BRAND } from "@openmasq/branding";

const { autoUpdater } = electronUpdater;

/** Injected main-process error reporter (read lazily: `setupAutoUpdates` installs it). */
type GetReportError = () => (code: string, err: unknown) => void;

/**
 * `update-downloaded` — the ONE place that decides whether a staged build may be applied.
 *
 * Its own module because the handler is `async` and an async listener has no owner:
 * `autoUpdater.on()` drops the returned promise, so a rejection inside it (a failing
 * statfs, a dialog that can't open) surfaced as an anonymous `uncaught/main-rejection`
 * instead of the update failure it is. Here the body is a named function and the wiring
 * owns its promise.
 */
export function wireDownloaded(getWin: () => BrowserWindow | null, getReportError: GetReportError): void {
  autoUpdater.on("update-downloaded", (info) => {
    void onDownloaded(info, getWin, getReportError).catch((err) => {
      logUpdateError("update-downloaded", err);
      reportUpdateFailure(getReportError(), "generic", err, { version: info?.version });
    });
  });
}

async function onDownloaded(
  info: { version?: string },
  getWin: () => BrowserWindow | null,
  getReportError: GetReportError,
): Promise<void> {
  const win = getWin();
  const size = totalUpdateSize(info);
  // PREVENT the ditto ENOSPC: ShipIt unzips a full copy on apply, so refuse to
  // restart-into-install when the volume can't hold it — and TELL the user how much
  // to free, instead of letting the update die mid-apply with a raw ditto error.
  const need = Math.ceil(size * APPLY_SPACE_FACTOR);
  const free = await freeBytes(app.getPath("userData"));
  if (free != null && need > 0 && free < need) {
    logUpdate(`refusing install: need ~${fmtGB(need)} free, have ${fmtGB(free)}`);
    // This refusal is OUR pre-check, so electron-updater's `error` event never fires —
    // report it explicitly or a disk-full install failure is invisible in PostHog.
    reportUpdateFailure(getReportError(), "no_space", new Error(`need ${fmtGB(need)}, have ${fmtGB(free)}`), {
      version: info?.version,
    });
    if (win && !win.isDestroyed())
      win.webContents.send("updates:status", {
        state: "error",
        code: "no_space",
        message: `Espace disque insuffisant pour installer la mise à jour (~${fmtGB(need)} libres nécessaires, ${fmtGB(free)} disponibles). Libérez de l'espace, puis relancez la mise à jour.`,
      });
    await dialog.showMessageBox({
      type: "warning",
      buttons: ["OK"],
      message: "Espace disque insuffisant",
      detail: `L'installation de ${BRAND.name} ${info.version} (${fmtGB(size)}) nécessite environ ${fmtGB(need)} d'espace libre, mais il ne reste que ${fmtGB(free)}. Libérez de l'espace disque, puis relancez la mise à jour.`,
      ...(win ? { window: win } : {}),
    });
    return;
  }
  // ⚠️ PLUS DE MODALE SYSTÈME ICI. Une boîte de dialogue de l'OS annonçait « <marque>
  // x.y.z is ready to install » en anglais, sans dire ce que la version apporte, et
  // volait le focus au milieu d'une phrase. C'est le RENDERER qui annonce désormais :
  // il a la note de version (Contentful) et il sait attendre — la fenêtre se referme,
  // un bouton du rail droit la rouvre. Main garde le seul geste qu'il est seul à
  // pouvoir faire, `updates:install`.
  //
  // Le statut est donc la SEULE sortie de ce chemin : ne pas l'émettre rendrait la mise
  // à jour invisible, puisque plus rien d'autre ne parle.
  logUpdate(`update downloaded: v${info?.version} (${fmtGB(size)})`);
  if (win && !win.isDestroyed())
    win.webContents.send("updates:status", {
      state: "downloaded",
      version: info?.version,
      sizeBytes: size,
    });
}
