/**
 * The files dropped on the composer but not yet sent, parked PER CONVERSATION and above
 * the screen's lifetime.
 *
 * They used to live in `ChatView`'s own state, which produced two opposite bugs from one
 * cause — the staging was tied to the SCREEN instead of to the conversation:
 *
 *  • navigating to Bibliothèque (or Réglages) and back DROPPED them. The screen unmounts,
 *    taking with it a document whose extraction and redaction the user had already
 *    waited for;
 *  • switching CONVERSATION kept them. The screen does NOT remount on a switch, so a file
 *    staged for one thread was still on the composer of the next — one click from being
 *    sent into the wrong conversation.
 *
 * Keying by conversation closes both at once. MEMORY-ONLY, like the composer draft it sits
 * beside: the bytes of an unsent file never reach disk from here. They are dropped on send
 * and with their conversation.
 *
 * Items are OPAQUE. This module parks them; it never reads their shape — `state/` importing
 * the screen's `Attachment` type would be the up-tree dependency the package forbids
 * (see `packages/ui/CLAUDE.md`), and the same discipline as `send/attachmentLayers.ts`,
 * which takes structurally only the fields it needs.
 */

/** Stable empty list: a fresh array per read would re-fire the consumer's restore effect. */
const EMPTY: readonly unknown[] = [];

export interface StagedFiles {
  /** What is staged for this conversation — never null, never a fresh array when empty. */
  get(convId: string): readonly unknown[];
  /** Replace the staging. An EMPTY list deletes the entry rather than storing `[]`, so a
   *  conversation the user emptied leaves nothing behind to leak or to iterate. */
  set(convId: string, items: readonly unknown[]): void;
  /** Forget this conversation's staging (it was deleted). */
  drop(convId: string): void;
}

export function createStagedFiles(): StagedFiles {
  const byConv: Record<string, readonly unknown[]> = {};
  return {
    get: (convId) => byConv[convId] ?? EMPTY,
    set: (convId, items) => {
      if (items.length) byConv[convId] = items;
      else delete byConv[convId];
    },
    drop: (convId) => {
      delete byConv[convId];
    },
  };
}
