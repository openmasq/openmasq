// M-9: the one-time notice when a packaged build has no OS keychain to encrypt at rest.
import { app, dialog } from "electron";
import { existsSync, writeFileSync } from "fs";
import { join } from "path/posix";
import { BRAND } from "@openmasq/branding";
import { encryptionAvailable } from "./store/safeStore";

export function warnIfNoAtRestEncryption(): void {
  if (!app.isPackaged || encryptionAvailable()) return;
  const marker = join(app.getPath("userData"), ".no-keychain-warned");
  if (existsSync(marker)) return;
  try {
    writeFileSync(marker, "1", { mode: 0o600 });
  } catch {
    /* best-effort — still show the warning */
  }
  void dialog.showMessageBox({
    type: "warning",
    title: "Chiffrement au repos indisponible",
    message: `${BRAND.name} n'a pas pu accéder au trousseau de votre système.`,
    detail: "Vos clés API, jetons de connexion, session et le coffre de redaction seront " +
      "stockés SANS chiffrement au repos sur cette machine (fichiers en 0600, mais " +
      "lisibles par quiconque accède au disque). Installez/déverrouillez un trousseau " +
      "(libsecret · GNOME Keyring · KWallet sur Linux) puis relancez pour l'activer.",
    buttons: ["Compris"],
  });
}
