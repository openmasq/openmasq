import { AnimatePresence } from "framer-motion";
import { PROVIDERS } from "@openmasq/llm";
import { AlertIcon, MemoryIcon } from "../../../../components/brand";
import { ConfirmDialog } from "../../../../components/feedback/ConfirmDialog";
import { Banner } from "../../../../components/feedback/Banner";
import { Toast } from "../../../../components/feedback/Toast";
import { SelectionMenu } from "../../../../components/SelectionMenu";
import { ApiKeyModal, ModelAccessModal } from "../../../../containers/modals";
import { TransparencyModal } from "../../../../containers/modals/TransparencyModal";
import { CliReconnectModal } from "../../../../containers/agentSetup/CliReconnectModal";
import { ChatBanners } from "../../ChatBanners";
import type { ChatViewModel } from "../model";

/** Modals, the selection menu, toasts and banners — everything layered over the thread. */
export function ChatOverlays({ m }: { m: ChatViewModel }) {
  const { p, t, view, sel, forced, intents, att, send } = m;
  const unread = send.unreadConfirm;
  const { conversation, orgProfile } = p;
  return (
    <>
      {/* Opened by the transparency card, and reopenable from the ⋯ menu — what lets the
          card show only once without the proof becoming unreachable. */}
      <AnimatePresence>
        {view.showComparison && conversation && (
          <TransparencyModal
            conversation={conversation}
            modelName={view.currentModelLabel}
            onClose={() => view.setShowComparison(false)}
          />
        )}
      </AnimatePresence>
      {/* A message renders the REAL text, so the selection IS the value to force. */}
      {sel.sel && (
        <SelectionMenu
          x={sel.sel.x}
          y={sel.sel.y}
          onPick={(token) => {
            forced.handleForceRedact(sel.sel!.text, token);
            forced.seedForcedFake(sel.sel!.text, token);
            sel.dropSelection();
          }}
          onVault={
            p.onAddToVault
              ? (token) => {
                  p.onAddToVault!(sel.sel!.text, token);
                  sel.dropSelection();
                }
              : undefined
          }
          onPreciser={sel.onPreciser}
          onRetenir={p.onAddMemoryCard && intents.memoryOpen ? sel.onRetenir : undefined}
        />
      )}
      {sel.memToast && (
        <Toast
          tone="success"
          icon={<MemoryIcon size={14} />}
          message={t.conversation.memoryToast}
          at={sel.memToast}
          duration={1600}
          onDone={sel.clearMemToast}
        />
      )}
      {orgProfile?.status === "suspended" && (
        <Banner tone="warning" title={t.conversation.suspendedTitle} message={t.conversation.suspendedBody} />
      )}
      {/* Files with nothing to send are NAMED before a send without them; « Annuler » keeps all. */}
      <AnimatePresence>
        {unread && (
          <ConfirmDialog
            title={t.runtime.send.unreadTitle(unread.length)}
            message={t.runtime.send.unreadBody(unread.length, unread.join(", "))}
            confirmLabel={t.runtime.send.unreadSendWithout(unread.length)}
            danger={false}
            icon={<AlertIcon size={19} />}
            onConfirm={send.confirmUnread}
            onCancel={send.cancelUnread}
          />
        )}
      </AnimatePresence>
      <ChatBanners attachWarning={att.attachWarning} onDismissAttachWarning={() => att.setAttachWarning(null)} />
    </>
  );
}

/** The two access modals; rendered AFTER the docked composer so the layering order holds. */
export function AccessModals({ m }: { m: ChatViewModel }) {
  const { p, keys } = m;
  return (
    <>
      <AnimatePresence>
        {keys.accessInfo && (
          <ModelAccessModal
            focus={keys.accessInfo.focus}
            providerLabel={keys.accessInfo.providerLabel}
            onClose={() => keys.setAccessInfo(null)}
            // Omitted for an account already covered — the modal then says so instead of pitching.
            onSubscribe={
              p.canPitchSubscription
                ? () => {
                    keys.setAccessInfo(null);
                    p.onOpenSettings("billing");
                  }
                : undefined
            }
            onOwnKeys={() => {
              keys.setAccessInfo(null);
              p.onOpenSettings("models");
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {keys.keyModalOpen && keys.keyTarget && (
          <ApiKeyModal
            provider={keys.keyTarget.provider}
            label={keys.keyTarget.label}
            keyUrl={PROVIDERS[keys.keyTarget.provider].keyUrl}
            onSave={keys.saveKey}
            onConnect={keys.keyTarget.provider === "openrouter" ? keys.connectKey : undefined}
            onClose={keys.closeKeyModal}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {keys.reconnect && (
          <CliReconnectModal
            cli={keys.reconnect.cli}
            label={keys.reconnect.label}
            onSignedIn={keys.reconnected}
            onClose={keys.closeReconnect}
          />
        )}
      </AnimatePresence>
    </>
  );
}
