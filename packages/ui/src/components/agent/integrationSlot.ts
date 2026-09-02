import type { Message } from "../../types";

/**
 * Which message hosts the conversation's ONE integration proposal — the render-side
 * budget (`MAX_SUGGESTIONS` is the per-turn one, in `agent/suggestIntegrations.ts`).
 *
 * Two rules, both about the cards' AUTHORITY:
 *  - **once per conversation**: the first settled reply that pinned suggestions keeps
 *    them; a later turn's are not shown. Repeating « connectez Gmail » under every reply
 *    is how a proposal becomes a banner people learn to ignore;
 *  - **never in the same turn as a once-only card** (Transparence, « Comprendre mon
 *    masquage », the memory proposal — docked above the composer): those show once, ever,
 *    so they take the turn; the suggestion waits for the next one. A proposal on the
 *    LATEST message is therefore withheld while such a card is up, and surfaces once the
 *    thread moves on (or the card is dismissed).
 *
 * Pure: `ChatView` computes it once per render and hands each bubble a boolean.
 */
export function integrationHostId(
  messages: readonly Pick<Message, "id" | "pending" | "suggestedIntegrations">[],
  onceCardShowing: boolean,
): string | null {
  const last = messages[messages.length - 1];
  for (const m of messages) {
    if (m.pending || !m.suggestedIntegrations?.length) continue;
    if (onceCardShowing && m === last) continue;
    return m.id;
  }
  return null;
}
