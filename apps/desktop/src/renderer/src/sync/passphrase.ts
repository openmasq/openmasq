/**
 * The E2E sync passphrase for the desktop renderer. Stored ENCRYPTED at rest in the MAIN
 * process (`safeStorage`, `sync:*-pass` IPC) — NOT in plaintext localStorage, where it (the
 * key that decrypts every device's synced vault) used to sit. Unset → vault sync is OFF. Set
 * the SAME passphrase on each device to sync (no key escrow — that's what keeps it E2E).
 *
 * ⚠️ **Per ACCOUNT** (`main/store/syncPass.ts`): it used to be device-scoped, so switching
 * account left sync armed with the previous account's key.
 *
 * ⚠️ And `set`/`clear` now **propagate** their failure. Swallowing it produced the most
 * treacherous case: the UI announced "disabled" while the encrypted file remained, and
 * the next read found the passphrase again — a reactivation nobody can explain.
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
    // Adopt it into the encrypted main-process store, then erase it — same semantics as
    // main-side adoption: the FIRST account signed in after the update inherits it.
    // ⚠️ We erase it ONLY if adoption succeeded: without a resolved account, `setPass` throws, and
    // discarding the value here would lose a passphrase nothing can give back (no escrow).
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
  await window.openmasq.sync.setPass(p); // throws if no account is resolved
  dropLegacy();
};

export const clearSyncPassphrase = async (): Promise<void> => {
  await window.openmasq.sync.clearPass(); // throws if the erase didn't happen
  dropLegacy();
};
