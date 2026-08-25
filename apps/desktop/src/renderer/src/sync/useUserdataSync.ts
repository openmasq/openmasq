/**
 * Drives the USERDATA studio channel off the chat store (sibling of `useConvSync`).
 * Compétences (routines comprises) et mémoire vivent comme des champs des Settings du
 * compte : pull the E2E `@userdata` scope (merged snapshot → `setSettings`), push the delta after a
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
    // Une seule liste depuis la fusion : `settings.workflows` n'est plus écrit
    // (la reprise le vide au chargement), le garder en dépendance ne réveillerait
    // qu'un push à vide.
    pushDeps: [store.settings.competences, store.settings.memoire],
  });
}
