import { memo } from "react";
import { conversationUsage } from "../../state/billing/usage";
import { useChatSelector, shallowEqual } from "../../containers/providers/chatStore";
import { formatTokens } from "../../state/billing/usage";
import { useT } from "../../i18n";

/**
 * Subtle per-conversation token total (in ↑ / out ↓), only when recorded. Reads its usage
 * from the store BY ID via a shallow-equal selector + `memo`, so it does NOT re-render on
 * every streamed token (usage changes only at a turn's END, not per token) — the first
 * consumer of the chat-store-context pattern (`useChatSelector`).
 */
export const ConversationTokens = memo(function ConversationTokens({ convId }: { convId: string }) {
  const u = useChatSelector((s) => {
    const c = s.conversations.find((cv) => cv.id === convId);
    return c ? conversationUsage(c) : null;
  }, shallowEqual);
  const t = useT();
  if (!u || u.total === 0) return null;
  return (
    <span
      className="usage-float"
      title={t.conversation.tokens.tip(formatTokens(u.total), formatTokens(u.inputTokens), formatTokens(u.outputTokens))}
    >
      {t.conversation.tokens.line(formatTokens(u.inputTokens), formatTokens(u.outputTokens))}
    </span>
  );
});
