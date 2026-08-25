/**
 * Per-CONVERSATION facts feeding `CONFIRMATION_POLICY` (`@openmasq/catalog/mcp`) on the
 * renderer side: how many web searches/fetches this conversation has dispatched (the
 * prompt-injection exposure the `standard` mode keys its single card on), and how many
 * confirmation cards were already shown (its `maxPerConversation` cap).
 *
 * Module-level + ephemeral ON PURPOSE — the same lifetime as the write allow-lists in
 * `pages/ChatWorkspace/writeConfirm.ts`: survives a ChatView remount, dies with the app.
 * After a restart the counters read 0, so a write in an old conversation stays quiet until
 * a NEW web search re-exposes it — "après une recherche internet" is about the session's
 * exposure, not an archive of it.
 *
 * The RECORDING sites are the loop's dispatch points (`mcpAgent.ts`: the sequential
 * dispatch + the `web_fetch_many` interception) — count what actually LEFT, never what the
 * model merely asked for. Rule 7 note: these counters gate the CARD only (renderer UX);
 * main's own gate reads main's own facts.
 */

const webSearches = new Map<string, number>();
const confirmationsShown = new Map<string, number>();

/** A web search / fetch DISPATCHED for this conversation (the loop calls this). */
export function recordWebSearch(convId: string): void {
  webSearches.set(convId, (webSearches.get(convId) ?? 0) + 1);
}

export function webSearchCount(convId: string): number {
  return webSearches.get(convId) ?? 0;
}

/** A confirmation card SHOWN for this conversation (whatever the user then answers —
 *  refuse counts too: the question was asked once). */
export function recordConfirmationShown(convId: string): void {
  confirmationsShown.set(convId, (confirmationsShown.get(convId) ?? 0) + 1);
}

export function confirmationsShownCount(convId: string): number {
  return confirmationsShown.get(convId) ?? 0;
}

/** Test-only. */
export function _resetConfirmationFacts(): void {
  webSearches.clear();
  confirmationsShown.clear();
}
