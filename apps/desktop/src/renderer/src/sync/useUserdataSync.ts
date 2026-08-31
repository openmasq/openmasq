/**
 * Drives the USERDATA studio channel off the chat store (sibling of `useConvSync`).
 * Compétences (routines included) and mémoire live as fields of the
 * account's Settings: pull the E2E `@userdata` scope (merged snapshot → `setSettings`), push the delta after a
 * local change settles. Best-effort; a total no-op without a passphrase / signed out.
 * Echo-safe: absorbed records align the ledger, so applying a pull never re-emits.
 *
 * Effect wiring: `useSyncChannel` (`@openmasq/ui`), shared with mobile.
 */
import { useRef } from "react";
import type { Settings, useChatStore } from "@openmasq/ui";
import { useSyncChannel, onWindowFocus } from "@openmasq/ui";
import { settingsPatchOf, snapshotOfSettings } from "@openmasq/sync";
import { pullUserdataStudio, pushUserdataStudio } from "./userdataSync";

type Store = ReturnType<typeof useChatStore>;

export function useUserdataSync(store: Store): void {
  const settingsRef = useRef(store.settings);
  settingsRef.current = store.settings;
  const setRef = useRef(store.setSettings);
  setRef.current = store.setSettings;

  useSyncChannel({
    ready: store.syncReady,
    resume: onWindowFocus,
    pull: () =>
      void pullUserdataStudio(snapshotOfSettings(settingsRef.current)).then((snap) => {
        if (!snap) return;
        // The patch's items keep any device-local extras (uses…) — absorb
        // spread-merges them; the cast narrows the structural sync types back
        // to the app's Settings unions.
        setRef.current((s) => ({ ...s, ...(settingsPatchOf(snap) as Partial<Settings>) }));
      }),
    push: () => void pushUserdataStudio(snapshotOfSettings(settingsRef.current)),
    // A single list since the merge: `settings.workflows` is no longer written
    // (recovery empties it on load), keeping it as a dependency would only
    // wake up an empty push.
    pushDeps: [store.settings.competences, store.settings.memoire],
  });
}
