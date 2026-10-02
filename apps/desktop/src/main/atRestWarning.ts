// M-9: the one-time notice when a packaged build has no OS keychain to encrypt at rest.
import { app, dialog } from "electron";
import { existsSync, writeFileSync } from "fs";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";
import { encryptionAvailable } from "./store/safeStore";
import { mainMessages } from "./i18n";

export function warnIfNoAtRestEncryption(): void {
  if (!app.isPackaged || encryptionAvailable()) return;
  const marker = join(app.getPath("userData"), ".no-keychain-warned");
  if (existsSync(marker)) return;
  try {
    writeFileSync(marker, "1", { mode: 0o600 });
  } catch {
    /* best-effort — still show the warning */
  }
  const t = mainMessages().desktopMain.atRest;
  void dialog.showMessageBox({
    type: "warning",
    title: t.title,
    message: t.message(BRAND.name),
    detail: t.detail,
    buttons: [t.ok],
  });
}
