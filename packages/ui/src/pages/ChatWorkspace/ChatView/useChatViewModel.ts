import { useEffect, useState } from "react";
import { useFeedbackOpen } from "../../../containers/providers/feedbackOpen";
import { useOpenConnector } from "../../../containers/providers/connectors";
import { redactionProblemDraft } from "../../../feedback/feedback";
import { useHost, type PdfDocument } from "../../../host";
import { useMcpConnectedIds } from "../../../hooks/useMcpConnectedIds";
import { useT } from "../../../i18n";
import type { ChatViewModel } from "./model";
import type { ChatViewProps } from "./types";
import { useAttachmentIntake } from "./useAttachmentIntake";
import { useAttachments } from "./useAttachments";
import { useConversationView } from "./useConversationView";
import { useForcedRedactions } from "./useForcedRedactions";
import { useIntentChips } from "./useIntentChips";
import { useKeyRetry } from "./useKeyRetry";
import { usePendingGates } from "./usePendingGates";
import { useRedactPolicy } from "./useRedactPolicy";
import { useScrollFollow } from "./useScrollFollow";
import { useSelectionActions } from "./useSelectionActions";
import { useSendPipeline } from "./useSendPipeline";

/** Composes the screen's hooks in dependency order; `ChatView` only renders the result. */
export function useChatViewModel(p: ChatViewProps): ChatViewModel {
  const { conversation, onDraftChange, getDraft, onOpenSettings } = p;
  const t = useT();
  const host = useHost();
  // `components/` must not read the host itself, so the PDF capability is threaded down.
  const renderPdf = host.pdf ? (doc: PdfDocument) => host.pdf!.renderHtml(doc) : undefined;
  const { openFeedback } = useFeedbackOpen();
  const openConnector = useOpenConnector();
  const reportRedaction = openFeedback
    ? (surface: "message" | "reponse", kind: string) => openFeedback(redactionProblemDraft(surface, t, kind))
    : undefined;
  // The connector modal opens OVER the conversation; with no host mounted (aperçu) ⇒ Réglages.
  const handleConnectIntegration = (id: string) =>
    openConnector ? openConnector(id) : onOpenSettings("mcp", id, conversation?.id);
  const connectedMcpIds = useMcpConnectedIds();

  // The draft is saved PER CONVERSATION as the user types and cleared on send; the
  // conversation-change effect below restores it, which is what makes it survive a tab switch.
  const [input, setInput] = useState("");
  const handleInput = (text: string) => {
    setInput(text);
    onDraftChange?.(conversation?.id ?? "", text);
  };
  const clearInput = () => handleInput("");
  useRestoreDraft(conversation?.id, () => setInput(getDraft ? getDraft(conversation?.id ?? "") : ""));

  const { redactPolicy, redactLevel } = useRedactPolicy(p);
  const att = useAttachments(p);
  const intake = useAttachmentIntake(p, att, redactPolicy);
  const forced = useForcedRedactions(p, att.setAttachments);
  const intents = useIntentChips(p);
  const view = useConversationView(p, t, intents.memoryOpen);
  const scroll = useScrollFollow(p, view.messages);
  const sel = useSelectionActions(p, { scrollRef: scroll.scrollRef, input, handleInput, setActiveTag: intents.setActiveTag, t });
  const gates = usePendingGates(p, view.activeStreaming);
  const keys = useKeyRetry(p);
  const send = useSendPipeline(p, { input, clearInput, activeStreaming: view.activeStreaming, att, forced, intents, gates });

  return {
    p,
    t,
    input,
    handleInput,
    redactPolicy,
    redactLevel,
    view,
    att,
    intake,
    forced,
    intents,
    sel,
    scroll,
    gates,
    keys,
    send,
    renderPdf,
    reportRedaction,
    connectedMcpIds,
    handleConnectIntegration,
  };
}

function useRestoreDraft(convId: string | undefined, restore: () => void) {
  useEffect(restore, [convId]);
}
