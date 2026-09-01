import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { VaultView } from "../../../pages/Vault";
import { vaultTermTypeLabel } from "../../../send/vaultTerms";
import { SharePromoteModal } from "../../orgShares/SharePromoteModal";
import { useHost } from "../../../host";
import type { VaultTerm } from "../../../types";
import type { ShellApi } from "../useShell";

/** Le Coffre — the always-redacted dictionary, with every place each term was used.
 *  In an ORGANIZATION the list is ONE and badged (design): the terms shared with
 *  you fold in read-only, and each personal row offers « Partager » — the promote
 *  dialog + the proposal live here. ⚠️ A term-share's LABEL carries the TYPE and
 *  note, never the value: an approver outside the audience must not read it. */
export function VaultSection({
  shell,
  onToggleSidebar,
}: {
  shell: ShellApi;
  onToggleSidebar?: () => void;
}) {
  const { chat, go } = shell;
  const host = useHost();
  const [promo, setPromo] = useState<VaultTerm | null>(null);
  return (
    <>
      <VaultView
        coffre={chat.settings.coffre ?? []}
        conversations={chat.conversations}
        loaded={chat.loaded}
        onAdd={chat.addVaultTerm}
        onRemove={chat.removeVaultTerm}
        org={chat.orgProfile ? { terms: chat.settings.orgCoffre ?? [] } : undefined}
        onShareTerm={host.orgShares ? (t) => setPromo(t) : undefined}
        onOpenConversation={(convId, msgId) => {
          if (msgId) chat.openConversationAt(convId, msgId);
          else chat.setActiveId(convId);
          go("chats");
        }}
        onToggleSidebar={onToggleSidebar}
      />
      <AnimatePresence>
        {promo && (
          <SharePromoteModal
            subject={{ kind: "term", term: promo }}
            onClose={() => setPromo(null)}
            onShare={async (audience) =>
              !!(await host.orgShares?.proposeCoffre({
                audience,
                label: `Terme (${vaultTermTypeLabel(promo.token)})${promo.note ? ` — ${promo.note}` : ""}`,
                terms: [promo],
              }))
            }
          />
        )}
      </AnimatePresence>
    </>
  );
}
