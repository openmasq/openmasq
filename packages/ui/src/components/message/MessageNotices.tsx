import { ShieldIcon, ZapIcon } from "../brand";
import { useT } from "../../i18n";
import { autoRouteCaption } from "../../send/autoRoute";
import { ToolStruggleNotice } from "./ToolStruggleNotice";
import { quotaNotice } from "./quotaNotice";
import type { Message } from "../../types";

/**
 * The captions under a settled reply: what went wrong with the turn's tools, and how
 * much of the model's quota is left.
 *
 * Grouped so the bubble has ONE slot for "what the app has to say about this turn"
 * rather than a growing list of conditionals in a file that may not grow. Both are
 * silent by default — a caption that appears on every reply stops being read. They wear
 * `.turn-status-note`: the line-sized member of the `.turn-status` family the outcome
 * card belongs to (`TurnStatus/`), so the two never drift into different margins.
 */
export function MessageNotices({
  message,
  modelName,
}: {
  message: Message;
  modelName?: string;
}) {
  const t = useT();
  if (message.pending) return null;
  const quota = quotaNotice(t, message.quotaLeft);
  return (
    <>
      {/* AUTO mode: which model got picked and whose money the send ran on —
          the metered escalation is EXPLICIT under the reply, never silent. */}
      {message.autoRouted && (
        <div
          className="shield-caption turn-status-note"
          title={t.conversation.bubble.autoRoutedTip}
        >
          <ZapIcon size={12} />
          <span className="flex-min">{autoRouteCaption(message.autoRouted, modelName)}</span>
        </div>
      )}
      {message.toolStruggle && (
        <ToolStruggleNotice struggle={message.toolStruggle} modelName={modelName} />
      )}
      {quota && (
        <div className="shield-caption warn turn-status-note" title={t.conversation.bubble.quotaTip}>
          <ShieldIcon size={12} />
          <span className="flex-min">{quota}</span>
        </div>
      )}
    </>
  );
}
