import type { Conversation } from "../types";

/** Longest title we keep. The auto-title is the first 48 characters of the opening
 *  message, so a hand-typed one is held to the same width — the sidebar row ellipsises
 *  anything longer anyway, and an unbounded string would ride into every persisted
 *  snapshot. */
export const CONV_TITLE_MAX = 48;

/**
 * A user-typed conversation title, normalised: trimmed, whitespace collapsed, capped.
 * Returns `null` when nothing usable is left — the caller must then keep the existing
 * title rather than write an empty one, or the row loses its name entirely and the
 * only way back is to guess which blank row it was.
 */
export function normalizeConvTitle(raw: string): string | null {
  const title = raw.replace(/\s+/g, " ").trim().slice(0, CONV_TITLE_MAX);
  return title || null;
}

/**
 * Rename builder. Lives OUTSIDE `store.ts` because that file is on the LOC ratchet and
 * new behaviour must land in a sibling module (`state/CLAUDE.md`); it takes the store's
 * own `patchConversation` so there is still exactly one writer of a conversation.
 *
 * ⚠️ It deliberately does NOT touch `updatedAt`. That field orders the sidebar's date
 * groups, and renaming an old thread is not activity in it — bumping it would tear the
 * conversation out of « Semaine dernière » and drop it under « Aujourd'hui », which
 * reads as the app having done something to its contents.
 */
export function makeRenameConversation(
  patchConversation: (id: string, patch: (c: Conversation) => Conversation) => void,
) {
  return (id: string, raw: string): void => {
    const title = normalizeConvTitle(raw);
    if (!title) return;
    patchConversation(id, (c) => (c.title === title ? c : { ...c, title }));
  };
}
