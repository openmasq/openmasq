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
  // The witness (Settings → Sync): the RESOLVED environment — the one from the
  // switch, never inferred from the channel — and the last exchange this session has seen.
  async status() {
    const ex = getExchangeState();
    let backendHost = BACKEND_URL;
    try {
      backendHost = new URL(BACKEND_URL).host;
    } catch {
      /* an exotic dev URL is shown as-is */
    }
    return { env: ENV_DISPLAY_NAME, backendHost, ...ex };
  },
  async getPassphrase() {
    return getSyncPassphrase();
  },
  async setPassphrase(passphrase) {
    await setSyncPassphrase(passphrase);
    // Changing the passphrase is the ONLY event that can make openable an envelope that
    // the circuit-breaker had sealed — without this reset, fixing one's passphrase would
    // produce no effect before a restart.
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
