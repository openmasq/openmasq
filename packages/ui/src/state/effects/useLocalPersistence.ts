import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Conversation, Settings } from "../../types";
import type { Host } from "../../host";
import {
  activeKeyFor,
  convKeyFor,
  localConvSnapshot,
  normalizeSettings,
  settingsKeyFor,
  stripUserContentForLocal,
} from "../storePersistence";

/**
 * The renderer's localStorage mirror: conversations, settings, the open conversation —
 * and the cross-window adoption of a settings blob written elsewhere.
 *
 * Peeled out of `store.ts` (rule 1). Everything here shares ONE subject — the plaintext
 * copy — and that is what makes the group worth existing: the strip decisions
 * (`localConvSnapshot`, `stripUserContentForLocal`) and the account SCOPING of every key
 * are the same privacy invariant seen from four angles, and reading them apart is how a
 * new field ends up persisted unstripped. The at-rest rules themselves stay in
 * `../CLAUDE.md`; this file only applies them.
 */
export function useLocalPersistence(p: {
  conversations: Conversation[];
  settings: Settings;
  activeId: string | null;
  userId: string | null | undefined;
  host: Host;
  /** The account the keys are scoped to. A ref, not state: the account-adopt effect
   *  moves it, and these writers must read the CURRENT scope, never a stale render's. */
  storageUidRef: MutableRefObject<string | null | undefined>;
  setSettings: Dispatch<SetStateAction<Settings>>;
}): void {
  const { conversations, settings, activeId, userId, host, storageUidRef, setSettings } = p;

  // DEBOUNCED (700 ms, like the DB mirror): `conversations` changes on EVERY streamed
  // token, and `localConvSnapshot` JSON.stringifies the whole set — re-writing it per
  // token made a long session progressively janky (O(n²) serialisation, worst on
  // mobile/web where the vault isn't stripped). The timeout resets on each change, so a
  // streaming burst produces ONE write ~700 ms after it settles. The account-SWITCH path
  // still flushes synchronously, and the DB is the durable copy on desktop.
  useEffect(() => {
    const key = convKeyFor(storageUidRef.current ?? null);
    if (!key) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, localConvSnapshot(conversations, !!host.db));
      } catch {
        /* localStorage unavailable / quota exceeded */
      }
    }, 700);
    return () => clearTimeout(t);
  }, [conversations, host, storageUidRef]);

  // Strip the coffre (real sensitive values) from the plaintext copy when an encrypted
  // Host DB owns it (F1) — the DB save keeps it, and the DB-load merge restores it.
  // Without a DB (browser preview / mobile) it stays here — which is exactly why the key
  // is ACCOUNT-SCOPED: on those platforms this blob IS the coffre.
  useEffect(() => {
    localStorage.setItem(
      settingsKeyFor(storageUidRef.current ?? null),
      JSON.stringify(stripUserContentForLocal(settings, !!host.db)),
    );
  }, [settings, host, userId, storageUidRef]);

  // Remember the open conversation so a reload restores it (account-scoped).
  useEffect(() => {
    const key = activeKeyFor(storageUidRef.current ?? null);
    if (!key) return;
    try {
      if (activeId) localStorage.setItem(key, activeId);
      else localStorage.removeItem(key);
    } catch {
      /* localStorage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scope ref is read live
  }, [activeId]);

  // Adopt settings written to localStorage from elsewhere (another window, or an e2e
  // harness seeding a scenario) WITHOUT a reload. Same-window `setItem` doesn't fire
  // `storage`, so callers dispatch the event explicitly.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // ONLY this account's key. It used to watch the unscoped `SETTINGS_KEY`, which now
      // (a) never fires, since the persist effect writes the scoped one, and (b) would
      // merge whatever blob another account left on the shared key into the signed-in
      // account's settings — coffre included.
      if (e.key !== settingsKeyFor(storageUidRef.current ?? null) || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue) as Partial<Settings>;
        setSettings((prev) => normalizeSettings({ ...prev, ...incoming }));
      } catch {
        /* ignore malformed payloads */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-scoped; refs read live
  }, []);
}
