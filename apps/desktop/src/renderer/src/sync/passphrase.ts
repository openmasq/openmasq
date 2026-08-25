/**
 * The E2E sync passphrase for the desktop renderer. Stored ENCRYPTED at rest in the MAIN
 * process (`safeStorage`, `sync:*-pass` IPC) — NOT in plaintext localStorage, where it (the
 * key that decrypts every device's synced vault) used to sit. Unset → vault sync is OFF. Set
 * the SAME passphrase on each device to sync (no key escrow — that's what keeps it E2E).
 *
 * ⚠️ **Par COMPTE** (`main/store/syncPass.ts`) : elle était à portée appareil, donc changer
 * de compte laissait la synchro armée avec la clé du précédent.
 *
 * ⚠️ Et `set`/`clear` **propagent** désormais leur échec. Les avaler donnait le cas le plus
 * traître : l'interface annonçait « désactivée » pendant que le fichier chiffré restait, et
 * la lecture suivante retrouvait la phrase — une réactivation que personne ne peut expliquer.
 */
import { BRAND } from "@openmasq/branding";

const LEGACY_KEY = `${BRAND.slug}:sync-pass`;

const readLegacy = (): string | null => {
  try {
    return localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
};
const dropLegacy = (): void => {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
};

export const getSyncPassphrase = async (): Promise<string | null> => {
  try {
    const v = await window.openmasq.sync.getPass();
    if (v) return v;
    // One-time migration: an older build kept the passphrase in plaintext localStorage.
    // Adopt it into the encrypted main-process store, then erase it — mêmes sémantiques que
    // l'adoption côté principal : le PREMIER compte connecté après la mise à jour l'hérite.
    // ⚠️ On ne l'efface QUE si l'adoption a réussi : sans compte résolu, `setPass` lève, et
    // jeter la valeur ici perdrait une phrase que rien ne peut redonner (aucun séquestre).
    const legacy = readLegacy();
    if (legacy) {
      try {
        await window.openmasq.sync.setPass(legacy);
      } catch {
        return null;
      }
      dropLegacy();
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
};

export const setSyncPassphrase = async (p: string): Promise<void> => {
  await window.openmasq.sync.setPass(p); // lève si aucun compte n'est résolu
  dropLegacy();
};

export const clearSyncPassphrase = async (): Promise<void> => {
  await window.openmasq.sync.clearPass(); // lève si l'effacement n'a pas eu lieu
  dropLegacy();
};
