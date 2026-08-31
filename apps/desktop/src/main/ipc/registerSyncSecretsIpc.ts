import { ipcMain } from "electron";
import {
  getSyncPass,
  setSyncPass,
  setSyncPassUser,
  clearSyncPass,
  getDeviceSecret,
  setDeviceSecret,
} from "../store/syncPass";

/**
 * The TWO sync secrets, exposed to the renderer — grouped here rather than spread
 * across `index.ts` (rule 10: the trust boundary is reviewed as a family, and this one
 * grew the day the device secret left localStorage).
 *
 * - **The passphrase** is the E2E key that decrypts the vaults of every device on the account.
 * - **The device secret** (TOFU) proves to the server that this device is indeed that one;
 *   it's what closes off replica impersonation, since the id is published by the device list.
 *
 * Both live encrypted at rest (`safeStorage`, `store/syncPass.ts`) — never in the renderer's
 * localStorage, which is Chromium LevelDB in the clear on disk.
 *
 * ⚠️ No `clear` for the device secret: losing it makes the device UNKNOWN to the server
 * (the stored hash is the one from the first registration and is never rewritten), which
 * would kill its sync with no recourse. This isn't an interface action.
 */
export function registerSyncSecretsIpc(): void {
  // Re-scoping per account. The uid comes from the renderer and ends up in a PATH, so it's
  // sanitized on the store side (`accountSecretFile` → `safeUid`): nothing exploitable survives,
  // and an entirely illegal value counts as "logged out" (nothing is written anywhere then).
  ipcMain.handle("sync:set-user", (_e, uid: unknown) =>
    setSyncPassUser(typeof uid === "string" ? uid : null),
  );
  ipcMain.handle("sync:get-pass", () => getSyncPass());
  ipcMain.handle("sync:set-pass", (_e, value: string) => setSyncPass(value));
  ipcMain.handle("sync:clear-pass", () => clearSyncPass());
  ipcMain.handle("sync:get-device-secret", () => getDeviceSecret());
  ipcMain.handle("sync:set-device-secret", (_e, value: string) => setDeviceSecret(value));
}
