/**
 * Drives the COFFRE channel off the chat store (sibling of `useUserdataSync`).
 * The Coffre lives as `Settings.coffre`: pull the E2E `@coffre` scope (merged terms →
 * `setSettings`), push the delta after a local change settles. Best-effort; a total
 * no-op without a passphrase / signed out. Echo-safe: absorbed records align the
 * ledger, so applying a pull never re-emits.
 *
 * The effect wiring — the `loaded` gate, the resume subscription, the debounce — is
 * `useSyncChannel` (`@openmasq/ui`), shared with mobile and with the two sibling
 * channels. Only the pull/push and the platform's resume signal are supplied here.
 */
import { useRef } from "react";
import type { CoffreTerm, useChatStore } from "@openmasq/ui";
import { useSyncChannel, onWindowFocus } from "@openmasq/ui";
import type { SyncedCoffreTerm } from "@openmasq/sync";
import { pullCoffre, pushCoffre } from "./coffreSync";

type Store = ReturnType<typeof useChatStore>;

export function useCoffreSync(store: Store): void {
  const settingsRef = useRef(store.settings);
  settingsRef.current = store.settings;
  const setRef = useRef(store.setSettings);
  setRef.current = store.setSettings;

  useSyncChannel({
    ready: store.syncReady,
    resume: onWindowFocus,
    pull: () =>
      void pullCoffre(settingsRef.current.coffre ?? []).then((terms) => {
        if (!terms) return;
        // Absorb spread-merges device-local extras; the cast narrows the
        // structural sync type back to the app's CoffreTerm.
        setRef.current((s) => ({ ...s, coffre: terms as CoffreTerm[] }));
      }),
    push: () => void pushCoffre((settingsRef.current.coffre ?? []) as SyncedCoffreTerm[]),
    pushDeps: [store.settings.coffre],
  });
}
