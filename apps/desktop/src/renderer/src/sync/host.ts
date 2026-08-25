/**
 * The desktop implementation of the UI's `SyncHost` (Settings → sync section).
 * The passphrase is stored ENCRYPTED at rest in the main process (safeStorage, via
 * `passphrase.ts` → `sync:*-pass` IPC), never synced; the device registry goes
 * through the sync client → backend. Setting a passphrase also heartbeats this
 * device so it appears in the list immediately.
 */
import { generatePassphrase } from "@openmasq/sync";
import type { SyncHost } from "@openmasq/ui";
import { clearSyncPassphrase, getSyncPassphrase, setSyncPassphrase } from "./passphrase";
import { checkPassphrase, listDevices, recordSync, registerDevice, revokeDevice, setDeviceName, SYNC_ENABLED } from "./client";
import { resetOrgKeys } from "./orgScopeSync";
import { getExchangeState } from "./status";
import { BACKEND_URL, ENV_DISPLAY_NAME } from "../appEnv";

export const syncHost: SyncHost = {
  enabled: SYNC_ENABLED,
  // Le témoin (Réglages → Synchronisation) : l'environnement RÉSOLU — celui de la
  // bascule, jamais déduit du canal — et le dernier échange vécu par cette session.
  async status() {
    const ex = getExchangeState();
    let backendHost = BACKEND_URL;
    try {
      backendHost = new URL(BACKEND_URL).host;
    } catch {
      /* une URL de dev exotique s'affiche telle quelle */
    }
    return { env: ENV_DISPLAY_NAME, backendHost, ...ex };
  },
  async getPassphrase() {
    return getSyncPassphrase();
  },
  async setPassphrase(passphrase) {
    await setSyncPassphrase(passphrase);
    // Changer de phrase est le SEUL événement qui peut rendre ouvrable une enveloppe que
    // le coupe-circuit avait scellée — sans cet oubli, corriger sa phrase ne produirait
    // aucun effet avant un redémarrage.
    recordSync()?.resetKeys();
    resetOrgKeys();
    await registerDevice();
  },
  async clearPassphrase() {
    await clearSyncPassphrase();
    recordSync()?.resetKeys();
    resetOrgKeys();
  },
  verifyPassphrase: checkPassphrase,
  generatePassphrase,
  listDevices,
  revokeDevice,
  setDeviceName,
};
