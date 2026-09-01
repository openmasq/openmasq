// Process-level channels: local PII detection, versions, the e2e flag, the auth store.
import { ipcMain, app } from "electron";
import { release } from "os";
import { type DetectLocalPayload, detectLocalPii } from "../localNer";
import { authStoreGet, authStoreSet, authStoreRemove } from "../store/authStore";
import { whenWindowShown } from "../store/safeStore";

// M-9: in a PACKAGED build with no OS keychain (a Linux box lacking libsecret /
// GNOME Keyring / KWallet, or a user who denied access), `safeStorage` can't
// encrypt — API keys, connector tokens, the auth session and the redaction VAULT
// fall back to base64 CLEARTEXT at rest (files are 0600 but readable off-disk).
// Warn the user ONCE so a distributable build doesn't silently store secrets
// unencrypted. Dev is unaffected (mock keychain / plaintext DB by design).
/** The small, process-level surface: local PII detection, versions, the auth store. */

export function registerAppHandlers(): void {
  // Offline local PII detection (GLiNER) for the "IA locale (hors-ligne)" engine.
  // Runs in-process (Node); the renderer wraps it into the redaction pipeline.
  ipcMain.handle("redact:detect-local", (_e, payload: DetectLocalPayload) => detectLocalPii(payload)
  );
  // App + runtime component versions for the Versions settings tab.
  ipcMain.handle("app:versions", () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${process.platform} ${release()} (${process.arch})`,
  }));

  // Is this a TEST launch? Read from main's LAUNCH-TIME env — the sandboxed preload
  // has no `process.env`, so the renderer can only learn it here. Discloses a single
  // boolean and grants nothing; it gates the renderer's `E2eBridge` (the programmatic
  // driver for the agentic loop), which is inert in every shipped build.
  ipcMain.handle("app:is-e2e", () => process.env.OPENMASQ_E2E === "1");
  // Supabase auth session (access + refresh tokens) — encrypted at rest via
  // safeStorage, NOT plaintext localStorage. Keyed by Supabase's own storage keys.
  // Hold the auth-session read (the ONLY keychain touch before sign-in) until the
  // window is on screen, so the OS keychain prompt lands at login, not cold boot.
  ipcMain.handle("authstore:get", async (_e, key: string) => {
    await whenWindowShown();
    return authStoreGet(key);
  });
  ipcMain.handle("authstore:set", async (_e, key: string, value: string) => {
    await whenWindowShown();
    authStoreSet(key, value);
  });
  ipcMain.handle("authstore:remove", async (_e, key: string) => {
    await whenWindowShown();
    authStoreRemove(key);
  });
}
