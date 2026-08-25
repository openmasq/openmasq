/**
 * The pure rule behind `useWorkspaceSync`'s tab seed. Kept out of the hook so it can be
 * tested without a render — the bug it encodes is an effect-ordering one, and this repo
 * tests logic, not components.
 */

/**
 * Whether an `activeId` that currently has NO open tab should be given one.
 *
 * The seed exists for an activeId set from OUTSIDE the layout — an account load restores
 * `activeId` before any tab exists, and without the seed the shell would show nothing.
 *
 * ⚠️ But "an activeId with no tab" is ALSO exactly what a just-CLOSED active tab looks
 * like for one render, before the layout→activeId mirror catches up: the store's activeId
 * is stale by a beat. Seeding there re-opened the tab the user had just closed. With a
 * single tab that tab is necessarily the active one, so it came back every time and the
 * close button looked dead.
 *
 * The two cases are indistinguishable from the CURRENT state alone — only history tells
 * them apart. A closed tab WAS open a moment ago; an externally-set activeId never was.
 * Hence `prevOpenTabIds`: absence that we just caused is a decision to respect, not a gap
 * to repair.
 */
export function shouldSeedActiveTab(p: {
  /** The store's active conversation (may lag the layout by one render). */
  activeId: string | null;
  /** Conversations with an open tab right now. */
  openTabIds: readonly string[];
  /** The same, as of the previous run of the effect. */
  prevOpenTabIds: readonly string[];
}): boolean {
  if (!p.activeId) return false;
  if (p.openTabIds.includes(p.activeId)) return false; // already has a tab — nothing to seed
  if (p.prevOpenTabIds.includes(p.activeId)) return false; // it was just CLOSED — respect it
  return true;
}

/**
 * The conversation id a pane's send should target — the pane's active ref ONLY when it
 * resolves to a LIVE conversation, else `null` so the caller mints a fresh one.
 *
 * ⚠️ A ghost ref (the pane's active tab points at a conversation absent from the store)
 * must NOT be reused. The prune can't remove it while the account has zero loaded
 * conversations, and the startup seed skips a non-null active ref — so the pane shows the
 * welcome with a truthy-but-dead `convId`. Reusing it sends into an id that
 * `patchConversation` matches nothing for: the message vanishes with no error (the
 * reported "clic sur un starter : rien ne se passe"). Falling back to `null` routes it
 * through the normal create-a-fresh-conversation path.
 */
export function sendTargetConvId(convId: string | null, conversationExists: boolean): string | null {
  return convId && conversationExists ? convId : null;
}
