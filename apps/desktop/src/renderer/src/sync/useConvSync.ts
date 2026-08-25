/**
 * Drives the RECORD channel off the chat store (the sibling of `useVaultSync`, which
 * owns the vault channel). Best-effort everywhere; a total no-op without a passphrase
 * / signed out.
 *
 *  • PULL on load + resume — changed conversations (another device's sends,
 *    deletions, brand-new threads) merge into the store.
 *  • PUSH (delta) after the active conversation settles — new final messages and meta
 *    changes; the same cycle tombstones LOCAL deletions, which is why `ready` is
 *    `store.syncReady` for the CURRENT account (an account switch empties the list, and
 *    a FAILED db load leaves the store unhydrated — neither must read as "everything
 *    was deleted" nor be re-created as skeletons). That gate lives in `useSyncChannel`.
 */
import { useRef } from "react";
import type { useChatStore } from "@openmasq/ui";
import { useSyncChannel, onWindowFocus } from "@openmasq/ui";
import { pullConvRecords, pushConvRecords } from "./convSync";

type Store = ReturnType<typeof useChatStore>;

export function useConvSync(store: Store): void {
  const convsRef = useRef(store.conversations);
  convsRef.current = store.conversations;
  const applyRef = useRef(store.applySyncedConversation);
  applyRef.current = store.applySyncedConversation;

  useSyncChannel({
    ready: store.syncReady,
    resume: onWindowFocus,
    pull: () =>
      void pullConvRecords(
        (id) => convsRef.current.find((c) => c.id === id),
        (id, conv) => applyRef.current(id, conv),
      ),
    push: () => void pushConvRecords(convsRef.current),
    // The active thread settling (a send finished, a title landed) and the COUNT
    // changing (a deletion → tombstone sweep) are both a reason to push.
    pushDeps: [store.active?.updatedAt, store.conversations.length],
  });
}
