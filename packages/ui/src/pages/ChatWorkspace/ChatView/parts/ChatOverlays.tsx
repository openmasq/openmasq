import { AnimatePresence } from "framer-motion";
import { PROVIDERS } from "@openmasq/llm";
import { MemoryIcon } from "../../../../components/brand";
import { Banner } from "../../../../components/feedback/Banner";
import { Toast } from "../../../../components/feedback/Toast";
import { SelectionMenu } from "../../../../components/SelectionMenu";
import { ApiKeyModal, ModelAccessModal } from "../../../../containers/modals";
import { TransparencyModal } from "../../../../containers/modals/TransparencyModal";
import { ChatBanners } from "../../ChatBanners";
import type { ChatViewModel } from "../model";

/** Modals, the selection menu, toasts and banners — everything layered over the thread. */
export function ChatOverlays({ m }: { m: ChatViewModel }) {
  const { p, t, view, sel, forced, intents, att } = m;
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
            onClose={keys.closeKeyModal}
          />
        )}
      </AnimatePresence>
    </>
  );
}
