import { useCallback, useRef, useState } from "react";
import type { Host } from "../../host";
import { SETTINGS_KEY, load } from "../storePersistence";

/**
 * API keys live encrypted in the main process (`host.keys`); the renderer only tracks
 * WHICH ids are configured — never a value (a renderer XSS can call any exposed IPC).
 */
export function useApiKeys(host: Host) {
  const [keyConfigured, setKeyConfigured] = useState<Set<string>>(new Set());
  const refreshKeys = useCallback(() => {
    host.keys?.configured().then((ids) => setKeyConfigured(new Set(ids))).catch(() => {});
  }, [host]);
  const setApiKey = useCallback(
    async (id: string, value: string) => {
      await host.keys?.set(id, value);
      refreshKeys();
    },
    [host, refreshKeys],
  );
  const clearApiKey = useCallback(
    async (id: string) => {
      await host.keys?.clear(id);
      refreshKeys();
    },
    [host, refreshKeys],
  );

  // Legacy plaintext keys are captured from the persisted blob at FIRST RENDER, before
  // the settings-persist effect rewrites localStorage (`normalizeSettings` strips them).
  // They migrate into the encrypted store of the FIRST account that signs in this
  // session, and never into a second one: the ref gives the import once-only semantics.
  const [legacyKeys] = useState<Record<string, string>>(() => {
    const raw = load<Record<string, unknown>>(SETTINGS_KEY, {});
    const apiKeys = (raw.apiKeys ?? {}) as Record<string, string>;
    const redactKey = raw.redactModelApiKey as string | undefined;
    return { ...apiKeys, ...(redactKey ? { redactModel: redactKey } : {}) };
  });
  const legacyImportedRef = useRef(false);

  return { keyConfigured, refreshKeys, setApiKey, clearApiKey, legacyKeys, legacyImportedRef };
}
