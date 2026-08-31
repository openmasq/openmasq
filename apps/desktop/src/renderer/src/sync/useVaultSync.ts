/**
 * Drives `@openmasq/sync` off the chat store. Two effects, both best-effort:
 *  • pull+merge a thread's remote vault when it becomes active (so replies
 *    un-redact with values another device produced),
 *  • push the active thread's vault + report new-redaction counts to the user's
 *    org(s), debounced, whenever the active conversation is touched.
 *
 * A hook keeps the wiring out of `App.tsx`. No-op end-to-end when sync is off
 * (no passphrase / no VITE_BACKEND_URL / signed out) — see `client.ts`.
 */
import { useEffect } from "react";
import { useChatStore } from "@openmasq/ui";
import { authHost } from "../auth";
import { pullConv, pushConv, registerDevice, reportAudit } from "./client";

type Store = ReturnType<typeof useChatStore>;

export function useVaultSync(store: Store): void {
  const activeId = store.active?.id;
  const touchedAt = store.active?.updatedAt;

  // Heartbeat this device into the account's device list: on app open AND whenever the
  // signed-in account (re)resolves. Mounting alone was NOT enough: on the very first
  // launch it runs BEFORE the session exists (the user signs in AFTER),
  // the transport then returns null with no error and nothing retried before the
  // next restart — the freshly installed Mac stayed invisible in
  // "Connected devices", its sync silent. We re-register on every auth event,
  // deduped by account (TOKEN_REFRESHED doesn't re-post).
  useEffect(() => {
    let registeredUid: string | null = null;
    void registerDevice();
    return authHost.onChange((user) => {
      if (!user || user.id === registeredUid) return;
      registeredUid = user.id;
      void registerDevice();
    });
  }, []);

  // Merge the remote vault for the freshly-activated thread.
  useEffect(() => {
    const active = store.active;
    if (!active) return;
    let cancelled = false;
    void pullConv(active).then((merged) => {
      if (!cancelled && merged) store.mergeVaultInto(active.id, merged.vault, merged.kinds);
    });
    return () => {
      cancelled = true;
    };
    // Re-run only when the active thread's cross-device key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Push + report after the active conversation settles (a send grew its vault).
  useEffect(() => {
    const active = store.active;
    if (!active) return;
    const t = setTimeout(() => {
      void pushConv(active);
      void reportAudit(store.conversations);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, touchedAt]);
}
