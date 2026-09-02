import { hueForKind } from "@openmasq/redact";
// Imported by FILE, not through the `containers/modals` barrel: the barrel also
// re-exports AttachmentPreviewModal, which imports back up into `pages/` — pulling
// it in from a page would close an import cycle for one title component.
import { ModalShell } from "../../containers/modals/ModalShell";
import { ModalTitle } from "../../containers/modals/ModalTitle";
import { ModelLogo } from "../../components/brand";
import { findModelAny } from "../../prompt/models";
import { VaultTermPill } from "./parts/VaultTermPill";
import type { VaultTerm } from "../../types";
import { vaultTermOccurrences, type VaultTermUse } from "../../send/vaultTerms";
import type { Conversation } from "../../types";
import { vaultTokenLabel } from "./vaultTypes";

import type { Messages } from "@openmasq/i18n";
import { useT } from "../../i18n";
/** Relative "il y a …" from an epoch ms — same spirit as the sidebar groups, kept
 *  local + pure so the modal has no date dependency. */
function ago(ms: number, t: Messages): string {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return t.lists.vault.uses.justNow;
  const m = s / 60;
  if (m < 60) return t.lists.vault.uses.minutesAgo(Math.floor(m));
  const h = m / 60;
  if (h < 24) return t.lists.vault.uses.hoursAgo(Math.floor(h));
  const d = h / 24;
  if (d < 7) return t.lists.vault.uses.daysAgo(Math.floor(d));
  return new Date(ms).toLocaleDateString(t.common.intlTag, { day: "numeric", month: "short" });
}

function UseRow({
  use,
  onOpen,
}: {
  use: VaultTermUse;
  onOpen: (convId: string, msgId?: string) => void;
}) {
  const t = useT();
  const model = findModelAny(use.modelId);
  return (
    <button
      type="button"
      className="om-vault-use"
      onClick={() => onOpen(use.convId, use.msgId)}
      title={t.lists.vault.uses.openConversation}
    >
      <ModelLogo provider={model?.provider ?? "openai-compat"} modelId={use.modelId} size={18} />
      <div className="om-vault-use-main">
        <div className="om-vault-use-title">{use.title}</div>
        <div className="om-vault-use-when">{ago(use.updatedAt, t)}</div>
      </div>
      <span className="om-vault-use-count">{use.count}×</span>
    </button>
  );
}

/** Where a coffre term has ACTUALLY been redacted — real data computed from the
 *  persisted conversations (`coffreOccurrences`). Mirrors the design's VaultUsesModal. */
export function VaultUsesModal({
  term,
  conversations,
  onOpen,
  onClose,
}: {
  term: VaultTerm;
  conversations: Conversation[];
  /** Open a conversation (optionally scrolled to the anchor message) — the row click. */
  onOpen: (convId: string, msgId?: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const tone = hueForKind(term.token);
  const { uses, totalCount, convCount } = vaultTermOccurrences(term, conversations);
  return (
    <ModalShell onClose={onClose} width="480px" maxHeight="80vh">
      <div className="om-vault-uses-head">
        <ModalTitle size="var(--text-lg)">{t.lists.vault.uses.title}</ModalTitle>
        <div className="om-vault-uses-tags">
          <VaultTermPill value={term.value} tone={tone} full />
          <span className="om-vault-uses-type">
            {vaultTokenLabel(term.token, t)}
            {term.note ? ` · ${term.note}` : ""}
          </span>
        </div>
        <div className="om-vault-uses-summary">
          {t.lists.vault.uses.summary(totalCount, convCount)}
        </div>
      </div>
      <div className="om-vault-uses-body">
        {uses.length === 0 ? (
          <div className="om-vault-uses-empty">{t.lists.vault.uses.none}</div>
        ) : (
          uses.map((u) => <UseRow key={u.convId} use={u} onOpen={onOpen} />)
        )}
      </div>
    </ModalShell>
  );
}
