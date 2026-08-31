import { ipcRenderer } from "electron";

/** Provider API keys — encrypted at rest in main; the renderer only sets/clears
 *  them and learns which ids are configured (never the values). */
export const keys = {
  setUser: (uid: string | null): Promise<void> => ipcRenderer.invoke("keys:set-user", uid),
  configured: (): Promise<string[]> => ipcRenderer.invoke("keys:configured"),
  set: (id: string, value: string): Promise<void> =>
    ipcRenderer.invoke("keys:set", id, value),
  clear: (id: string): Promise<void> => ipcRenderer.invoke("keys:clear", id),
  // "Connect my OpenRouter account" (OAuth PKCE). Resolves true once the key is
  // stored. Nothing comes BACK through this channel but a boolean — the key is minted
  // and written entirely in main.
  connectOpenRouter: (): Promise<boolean> => ipcRenderer.invoke("keys:connect-openrouter"),
  importLegacy: (map: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke("keys:import", map),
  // Organization posture: a managed account neither writes nor uses a personal key.
  setOrgByoAllowed: (allowed: boolean | null): Promise<void> =>
    ipcRenderer.invoke("keys:set-org-byo-allowed", allowed),
};

/** Cross-device sync passphrase (the E2E key) — stored ENCRYPTED at rest in the
 *  main process (safeStorage), never in plaintext localStorage. */
export const sync = {
  // The passphrase is PER ACCOUNT (`main/store/syncPass.ts`): this re-scope follows that of the keys,
  // the DB and MCP. Without it, switching account left the previous one's passphrase in
  // place and restarted sync for someone who had never asked for it.
  setUser: (uid: string | null): Promise<void> => ipcRenderer.invoke("sync:set-user", uid),
  getPass: (): Promise<string | null> => ipcRenderer.invoke("sync:get-pass"),
  setPass: (value: string): Promise<void> => ipcRenderer.invoke("sync:set-pass", value),
  clearPass: (): Promise<void> => ipcRenderer.invoke("sync:clear-pass"),
  // The device secret follows the passphrase: encrypted at rest in main, never
  // in localStorage. No `clear` exposed — a device that loses its secret
  // becomes a device UNKNOWN to the server, which is not a UI action.
  getDeviceSecret: (): Promise<string | null> => ipcRenderer.invoke("sync:get-device-secret"),
  setDeviceSecret: (value: string): Promise<void> =>
    ipcRenderer.invoke("sync:set-device-secret", value),
};

/** Supabase auth session (access + refresh tokens) — stored ENCRYPTED at rest in
 *  the main process (safeStorage), never plaintext localStorage. Backs a custom
 *  Supabase `storage` adapter in the renderer's `auth.ts`. */
export const authStore = {
  get: (key: string): Promise<string | null> => ipcRenderer.invoke("authstore:get", key),
  set: (key: string, value: string): Promise<void> => ipcRenderer.invoke("authstore:set", key, value),
  remove: (key: string): Promise<void> => ipcRenderer.invoke("authstore:remove", key),
};
