import { hueForKind } from "@openmasq/redact";
// Imported by FILE, not through the `containers/modals` barrel: the barrel also
// re-exports AttachmentPreviewModal, which imports back up into `pages/` — pulling
// it in from a page would close an import cycle for one title component.
import { ModalShell } from "../../containers/modals/ModalShell";
import { ModalTitle } from "../../containers/modals/ModalTitle";
import { ModelLogo } from "../../components/brand";
import { findModelAny } from "../../prompt/models";
import { VaultTermPill } from "./parts/VaultTermPill";
import type { CoffreTerm } from "../../types";
import { coffreOccurrences, coffreTypeLabel, type CoffreUse } from "../../send/coffre";
import type { Conversation } from "../../types";

/** Relative "il y a …" from an epoch ms — same spirit as the sidebar groups, kept
 *  local + pure so the modal has no date dependency. */
function ago(ms: number): string {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "à l'instant";
  const m = s / 60;
  if (m < 60) return `il y a ${Math.floor(m)} min`;
  const h = m / 60;
  if (h < 24) return `il y a ${Math.floor(h)} h`;
  const d = h / 24;
  if (d < 7) return `il y a ${Math.floor(d)} j`;
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function UseRow({
  use,
  onOpen,
}: {
  use: CoffreUse;
  onOpen: (convId: string, msgId?: string) => void;
}) {
  const model = findModelAny(use.modelId);
  return (
    <button
      type="button"
      className="om-vault-use"
      onClick={() => onOpen(use.convId, use.msgId)}
      title="Ouvrir la conversation"
    >
      <ModelLogo provider={model?.provider ?? "openai-compat"} modelId={use.modelId} size={18} />
      <div className="om-vault-use-main">
        <div className="om-vault-use-title">{use.title}</div>
        <div className="om-vault-use-when">{ago(use.updatedAt)}</div>
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
  term: CoffreTerm;
  conversations: Conversation[];
  /** Open a conversation (optionally scrolled to the anchor message) — the row click. */
  onOpen: (convId: string, msgId?: string) => void;
  onClose: () => void;
}) {
  const tone = hueForKind(term.token);
  const { uses, totalCount, convCount } = coffreOccurrences(term, conversations);
  return (
    <ModalShell onClose={onClose} width="480px" maxHeight="80vh">
      <div className="om-vault-uses-head">
        <ModalTitle size="var(--text-lg)">Occurrences</ModalTitle>
        <div className="om-vault-uses-tags">
          <VaultTermPill value={term.value} tone={tone} full />
          <span className="om-vault-uses-type">
            {coffreTypeLabel(term.token)}
            {term.note ? ` · ${term.note}` : ""}
          </span>
        </div>
        <div className="om-vault-uses-summary">
          Redacted <strong>{totalCount} fois</strong> dans{" "}
          <strong>
            {convCount} conversation{convCount > 1 ? "s" : ""}
          </strong>
          .
        </div>
      </div>
      <div className="om-vault-uses-body">
        {uses.length === 0 ? (
          <div className="om-vault-uses-empty">Ce terme n'a encore été redacted nulle part.</div>
        ) : (
          uses.map((u) => <UseRow key={u.convId} use={u} onOpen={onOpen} />)
        )}
      </div>
    </ModalShell>
  );
}
