import { publishStaged } from "../../state/files/stagedActivity";
import type { Attachment } from "./Composer";

/** The store's per-conversation staging, as the chat screen sees it (the store keeps items opaque). */
export interface StagedStore {
  get(key: string): readonly Attachment[];
  set(key: string, items: readonly Attachment[]): void;
}

/** A file still being read or masked — what marks its conversation in the sidebar and tabs. */
const isAttachmentBusy = (a: Attachment): boolean => !!a.extracting || !!a.redacting;

/**
 * THE writer of a conversation's staging. Every write goes to the STORE, keyed by the
 * conversation the file was staged for — never to « whatever is on screen now »: a read or
 * a masking run that ends after the user switched conversation must land on ITS chip, not
 * miss on the open one. The signal then lets the view showing that conversation re-read
 * it, and the rows re-mark it (`ChatView/useAttachments.test.tsx`).
 */
export function writeStaged(store: StagedStore, key: string, items: readonly Attachment[]): void {
  store.set(key, items);
  publishStaged(key, items.some(isAttachmentBusy));
}

/** Patch one chip of a conversation's staging. `false` when the chip is no longer staged
 *  (removed, sent, conversation deleted) — the caller's run then stops. */
export function patchStaged(store: StagedStore, key: string, cid: string, patch: Partial<Attachment>): boolean {
  const list = store.get(key);
  if (!list.some((a) => a.cid === cid)) return false;
  writeStaged(
    store,
    key,
    list.map((a) => (a.cid === cid ? { ...a, ...patch } : a)),
  );
  return true;
}
