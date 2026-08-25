import { useEffect, useRef, useState } from "react";
import {
  IconButton,
  CopyIcon,
  CheckIcon,
  RefreshIcon,
  ForkIcon,
  FeedbackIcon,
} from "../brand";
import { useAvisOpen } from "../../containers/providers/avisOpen";
import { messageFeedbackDraft } from "../../avis/avis";
import { journalExportFor } from "../../containers/modals/DebugLogModal/entryText";
import { copyText } from "../../hooks/clipboard";
import { captureEvent } from "../../analytics";

/** Message ids whose avis glyph has already done its one-off pulse. Module-level and
 *  deliberately session-scoped: it holds ids, the message list is VIRTUALISED (a
 *  bubble re-mounts every time it scrolls back into view), and a per-conversation
 *  reset would re-pulse everything on each thread switch. */
const pulsedAvis = new Set<string>();

/**
 * The row under a finished reply: Copier · Régénérer · Forker · Avis.
 *
 * Split out of `MessageBubble` when the avis action landed — the bubble is already
 * the biggest component in the tree, and this row is a self-contained leaf with its
 * own transient state (the copied flash, the one-off pulse) that the bubble never
 * reads. Each action renders only when its handler exists, so a surface that can't
 * fork (or has nowhere to send an avis) simply shows fewer buttons.
 */
export function MessageActions({
  messageId,
  content,
  conversationId,
  onRegenerate,
  onFork,
}: {
  messageId: string;
  /** The reply's text — what Copier puts on the clipboard. */
  content: string;
  /** Scopes the debug journal an avis may attach; absent ⇒ app-level entries only. */
  conversationId?: string;
  onRegenerate?: (assistantId: string) => void;
  onFork?: (messageId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  // Absent without `host.avis` (nowhere to send it) — same contract as every other
  // report affordance in the app.
  const { openAvis } = useAvisOpen();

  // Decide ONCE per mount whether this reply's glyph still owes its nudge, then
  // record it in an effect (never during render, which React may replay).
  const pulseRef = useRef<boolean | null>(null);
  if (pulseRef.current === null) pulseRef.current = !!openAvis && !pulsedAvis.has(messageId);
  useEffect(() => {
    if (pulseRef.current) pulsedAvis.add(messageId);
  }, [messageId]);

  return (
    <div className="msg-actions">
      <IconButton
        size="sm"
        label={copied ? "Copié" : "Copier"}
        onClick={async () => {
          await copyText(content);
          captureEvent({ name: "copy_reply" });
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      </IconButton>
      {onRegenerate && (
        <IconButton
          size="sm"
          label="Régénérer"
          onClick={() => {
            captureEvent({ name: "regenerate" });
            onRegenerate(messageId);
          }}
        >
          <RefreshIcon size={16} />
        </IconButton>
      )}
      {onFork && (
        <IconButton
          size="sm"
          label="Dupliquer la conversation à partir d'ici"
          onClick={() => onFork(messageId)}
        >
          <ForkIcon size={16} />
        </IconButton>
      )}
      {/* Report THIS reply without leaving it. The journal is read at CLICK time
          (`journalExportFor` reads the live debug buffer) and never subscribed to: a
          row that re-rendered on every debug entry would cost a list re-render per
          streamed turn, for a value only one click ever needs. */}
      {openAvis && (
        <IconButton
          size="sm"
          className={pulseRef.current ? "msg-action-pulse" : undefined}
          label="Donner un avis sur cette réponse"
          onClick={() => {
            openAvis(messageFeedbackDraft(journalExportFor(conversationId)));
            captureEvent({ name: "avis_from_message" });
          }}
        >
          <FeedbackIcon size={16} />
        </IconButton>
      )}
    </div>
  );
}
