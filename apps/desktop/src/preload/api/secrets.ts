import { ipcRenderer } from "electron";

/** Provider API keys — encrypted at rest in main; the renderer only sets/clears
 *  them and learns which ids are configured (never the values). */
export const keys = {
  setUser: (uid: string | null): Promise<void> => ipcRenderer.invoke("keys:set-user", uid),
  configured: (): Promise<string[]> => ipcRenderer.invoke("keys:configured"),
  set: (id: string, value: string): Promise<void> =>
    ipcRenderer.invoke("keys:set", id, value),
  clear: (id: string): Promise<void> => ipcRenderer.invoke("keys:clear", id),
  // « Connecter mon compte OpenRouter » (OAuth PKCE). Resolves true once the key is
  // stored. Nothing comes BACK through this channel but a boolean — the key is minted
  // and written entirely in main.
  connectOpenRouter: (): Promise<boolean> => ipcRenderer.invoke("keys:connect-openrouter"),
  importLegacy: (map: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke("keys:import", map),
  // Posture d'organisation : un compte géré n'écrit ni n'utilise de clé personnelle.
  setOrgByoAllowed: (allowed: boolean | null): Promise<void> =>
    ipcRenderer.invoke("keys:set-org-byo-allowed", allowed),
};

/** Cross-device sync passphrase (the E2E key) — stored ENCRYPTED at rest in the
 *  main process (safeStorage), never in plaintext localStorage. */
export const sync = {
  // La phrase est PAR COMPTE (`main/store/syncPass.ts`) : ce re-scope suit celui des clés,
  // de la base et de MCP. Sans lui, changer de compte laissait la phrase du précédent en
  // place et relançait la synchro pour quelqu'un qui ne l'avait jamais demandée.
  setUser: (uid: string | null): Promise<void> => ipcRenderer.invoke("sync:set-user", uid),
  getPass: (): Promise<string | null> => ipcRenderer.invoke("sync:get-pass"),
  setPass: (value: string): Promise<void> => ipcRenderer.invoke("sync:set-pass", value),
  clearPass: (): Promise<void> => ipcRenderer.invoke("sync:clear-pass"),
  // Le secret d'appareil suit la phrase : chiffré au repos dans le principal, jamais
  // dans le localStorage. Pas de `clear` exposé — un appareil qui perd son secret
  // devient un appareil INCONNU du serveur, ce qui n'est pas une action d'interface.
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
