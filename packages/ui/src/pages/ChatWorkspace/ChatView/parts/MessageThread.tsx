import { PROVIDERS } from "@openmasq/llm";
import { MessageBubble } from "../../../../components/message/MessageBubble";
import { VirtualMessageList } from "../../../../components/VirtualMessageList";
import { findModelAny } from "../../../../prompt/models";
import type { ChatViewModel } from "../model";

/** The windowed thread. Keyed per conversation so the windowing resets on open. */
export function MessageThread({ m }: { m: ChatViewModel }) {
  const { p, view, scroll, gates, keys, intents } = m;
  const { conversation } = p;
  return (
    <div className="messages-inner" ref={scroll.innerRef}>
      <VirtualMessageList
        key={conversation?.id ?? "none"}
        items={view.messages}
        scrollRef={scroll.scrollRef}
        getKey={(msg) => msg.id}
        apiRef={scroll.listApi}
        // A bubble's mount cost tracks its text length, so a few pasted documents must window too.
        sizeOf={(msg) => msg.content.length}
        initialAnchor="bottom"
      >
        {(msg) => {
          // The model that actually produced this reply, pinned at send time.
          const msgModel = msg.model ? findModelAny(msg.model) : undefined;
          const msgProvider = msgModel?.provider ?? view.provider;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              provider={msgProvider}
              modelId={msgModel?.id ?? view.currentModel?.id}
              modelName={msgModel?.label ?? view.currentModel?.label}
              vendor={msgProvider ? PROVIDERS[msgProvider].label : view.vendor}
              vault={conversation?.redactionVault}
              kinds={view.spanKinds}
              displayTokens={view.displayTokens}
              conversationId={conversation?.id}
              sessionConversationId={conversation?.sessionConversationId}
              onRegenerate={p.onRegenerate}
              onFork={p.onFork}
              onEditDocument={p.onEditDocument}
              onAddSkill={intents.skillsUsable ? intents.addProposedSkill : undefined}
              isSkillAdded={intents.isProposedSkillAdded}
              renderPdf={m.renderPdf}
              onOpenFileTab={p.onOpenFileTab}
              onErrorAction={keys.handleErrorAction}
              onReveal={p.onReveal}
              onReRedact={p.onReRedact}
              onReportRedaction={m.reportRedaction}
              isRevealForced={p.isRevealForced}
              revealedValues={conversation?.revealedValues}
              highlight={msg.id === scroll.highlightId}
              linkPreviews={!!p.settings?.linkPreviews}
              onConnectIntegration={m.handleConnectIntegration}
              hideIntegrations={msg.id !== view.integrationHost}
              onOpenTransparency={() => view.setShowComparison(true)}
              connectedMcpIds={m.connectedMcpIds}
              credits={p.credits}
              creditsResetIso={p.creditsResetIso}
              // Both gates belong to the pending assistant bubble — inline under it.
              webNavConfirm={msg.pending && gates.pendingWebNav ? gates.pendingWebNav.categories : null}
              onWebNavDecision={gates.onWebNavDecision}
              writeConfirm={msg.pending && gates.pendingWrite ? gates.pendingWrite.info : null}
              onWriteDecision={gates.onWriteDecision}
            />
          );
        }}
      </VirtualMessageList>
    </div>
  );
}
