import { useMemo, useRef, useState } from "react";
import { PROVIDERS } from "@openmasq/llm";
import { vaultDisplayTokens } from "@openmasq/redact";
import type { Messages } from "@openmasq/i18n";
import { integrationHostId } from "../../../components/agent/integrationSlot";
import { isExplicitMemoryAsk, worthExtracting, type ConvSlice } from "../../../memory/extract";
import { protectedValueCount, shouldShowTransparencyCard } from "../../../privacy/transparency";
import { shouldShowRedactionIntro } from "../../../privacy/redactionIntro";
import { effectiveDefaultModelId } from "../../../prompt/defaultModel";
import { ALL_MODELS, findModelAny } from "../../../prompt/models";
import { isAutoModelId } from "../../../send/autoRoute";
import { conversationProtectedCount } from "../../../state/redaction/protectedCount";
import { timeGreeting } from "../greeting";
import type { ChatViewProps } from "./types";

/** Everything the screen DERIVES from the conversation and the settings — no gesture here. */
export function useConversationView(p: ChatViewProps, t: Messages, memoryOpen: boolean) {
  const { conversation, settings, userName, unavailableModels, orgProfile, onOpenGuideChapter, onChangeSettings } = p;
  const messages = conversation?.messages ?? [];
  // Per-conversation streaming: the composer's send/stop and submit guard gate on THIS
  // thread generating, so an idle tab stays sendable while another streams.
  const activeStreaming = messages.some((m) => m.pending);

  // value → kind, gathered from every message so a span is coloured by its real category in
  // both the user's message and the restored reply. Returns the SAME object while the mapping
  // is unchanged, so the memoized bubbles don't all re-highlight on every streamed chunk.
  const spanKindsRef = useRef<Record<string, string>>({});
  const spanKinds = useMemo(() => {
    const map: Record<string, string> = { ...(conversation?.redactionKinds ?? {}) };
    for (const m of messages) for (const s of m.redactedSpans ?? []) map[s.value] = s.kind;
    const prev = spanKindsRef.current;
    const keys = Object.keys(map);
    if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === map[k])) return prev;
    spanKindsRef.current = map;
    return map;
  }, [messages, conversation?.redactionKinds]);
  // ONE real→`[PERSON1]` map for the whole conversation, so the numbering is conversation-wide.
  const displayTokens = useMemo(
    () =>
      settings?.redactTokenDisplay && conversation?.redactionVault
        ? vaultDisplayTokens(conversation.redactionVault, spanKinds)
        : undefined,
    [settings?.redactTokenDisplay, conversation?.redactionVault, spanKinds],
  );

  // The one-time cards under the composer. Transparency goes first and shows once; the
  // redaction intro never at the same time (two stacked invitations read like advertising).
  const [showComparison, setShowComparison] = useState(false);
  const showTransparency = !activeStreaming && shouldShowTransparencyCard(conversation, settings?.transparencySeen);
  const showRedactionIntro =
    !activeStreaming &&
    !showTransparency &&
    !!onOpenGuideChapter &&
    shouldShowRedactionIntro(conversation, settings?.redactionIntroSeen);
  const memorySlice = useMemo<ConvSlice | null>(() => {
    if (!conversation) return null;
    const msgs = conversation.messages.slice(conversation.memoryWatermark ?? 0);
    if (!msgs.length) return null;
    return {
      userTexts: msgs.filter((m) => m.role === "user").map((m) => m.content).filter(Boolean),
      kinds: Object.fromEntries(msgs.flatMap((m) => (m.redactedSpans ?? []).map((s) => [s.value, s.kind] as const))),
    };
  }, [conversation]);
  // Offered when THIS settled conversation carries durable-fact signals while the silent
  // extraction is off. An explicit « retiens que… » is excluded — it works by itself.
  const showMemoryProposal =
    !!settings &&
    settings.memoryAuto !== true &&
    settings.memoryProposalSeen !== true &&
    !activeStreaming &&
    !!memorySlice &&
    memorySlice.userTexts.length > 0 &&
    !isExplicitMemoryAsk(memorySlice.userTexts.join("\n")) &&
    worthExtracting(memorySlice);
  const onceCardShowing =
    !!settings && !!onChangeSettings && (showTransparency || showRedactionIntro || (showMemoryProposal && memoryOpen));
  const integrationHost = integrationHostId(messages, onceCardShowing);

  // The model shown in the header + composer. With NO conversation, the saved default, else
  // the first model. AUTO: the sentinel doesn't resolve; `autoMode` fixes what the screen says.
  const defaultModelId = effectiveDefaultModelId(settings?.defaultModelId, unavailableModels, orgProfile?.allowedModelIds);
  const autoMode = isAutoModelId(conversation?.modelId ?? defaultModelId ?? "");
  const currentModel = findModelAny(conversation?.modelId ?? "") ?? findModelAny(defaultModelId ?? "") ?? ALL_MODELS[0];
  const currentModelLabel = autoMode ? "Auto" : currentModel?.label;
  const provider = currentModel?.provider;
  const vendor = provider ? PROVIDERS[provider].label : undefined;

  // DISTINCT protected values from the conversation vault — the single definition shared
  // with the sidebar shield and the confidentialité report (`state/protectedCount.ts`).
  const protectedCount = conversation ? conversationProtectedCount(conversation) : 0;
  const transparencyCount = conversation ? protectedValueCount(conversation) : 0;
  const greeting = timeGreeting(new Date().getHours(), t) + (userName ? ` ${userName}` : "");

  return {
    messages,
    activeStreaming,
    spanKinds,
    displayTokens,
    showComparison,
    setShowComparison,
    showTransparency,
    showRedactionIntro,
    showMemoryProposal,
    integrationHost,
    defaultModelId,
    autoMode,
    currentModel,
    currentModelLabel,
    provider,
    vendor,
    protectedCount,
    transparencyCount,
    greeting,
  };
}

export type ConversationViewApi = ReturnType<typeof useConversationView>;
