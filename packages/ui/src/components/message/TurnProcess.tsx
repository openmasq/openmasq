import { ToolTrace } from "../ToolTrace";
import { ReasoningPanel } from "./ReasoningPanel";
import { assistantBody } from "./messageBubbleView";
import type { Message } from "../../types";

/**
 * Everything an assistant turn shows ABOVE its answer: how the turn was reached,
 * in the order it happened — the model's reflection, then the connector tool calls.
 *
 * One component rather than two slots in `MessageBubble` because the two are one
 * story and share one rule: both are PERSISTED, so a reloaded conversation still
 * explains itself, and both must stand down while the turn has nothing else to show
 * (the reflection is then the `ThinkingIndicator`'s, live and tail-cropped — showing
 * it collapsed here at the same time would be the same text in two places).
 */
export function TurnProcess({ message }: { message: Message }) {
  const reasoning = message.reasoning?.trim();
  // `assistantBody === "thinking"` is exactly "the loader owns the bubble" — the one
  // state where the reflection is already on screen, in full, somewhere else.
  const showReasoning = !!reasoning && assistantBody(message) !== "thinking";
  const showTools = !!(message.toolCalls?.length || (message.pending && message.toolCall));
  if (!showReasoning && !showTools) return null;

  return (
    <>
      {showReasoning && <ReasoningPanel text={reasoning!} />}
      {showTools && (
        <ToolTrace
          calls={message.toolCalls}
          pendingTool={message.pending ? message.toolCall : undefined}
          pendingStatus={message.pending ? message.toolStatus : undefined}
          live={!!message.pending}
        />
      )}
    </>
  );
}
