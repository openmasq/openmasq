import { memo } from "react";
import { conversationUsage } from "../../state/usage";
import { useChatSelector, shallowEqual } from "../../containers/providers/chatStore";
import { formatTokens } from "../../state/usage";

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
  if (!u || u.total === 0) return null;
  return (
    <span
      className="usage-float"
      title={`${formatTokens(u.total)} tokens (entrée ${formatTokens(
        u.inputTokens,
      )} · sortie ${formatTokens(u.outputTokens)})`}
    >
      ↑ {formatTokens(u.inputTokens)} · ↓ {formatTokens(u.outputTokens)} tokens
    </span>
  );
});
