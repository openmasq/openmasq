import { hueForKind } from "@openmasq/redact";
import { ModelLogo, ShieldIcon, TrashIcon } from "../../../components/brand";
import { ScopeBadge } from "../../../components/brand/ScopeBadge";
import { findModelAny } from "../../../prompt/models";
import { coffreTypeLabel, type CoffreOccurrences } from "../../../send/coffre";
import type { CoffreTerm } from "../../../types";
import { VaultTermPill } from "./VaultTermPill";

import { useT } from "../../../i18n";
/** The models that have actually seen this term redacted — deduped, most-recent
 *  first (the uses already arrive sorted), capped like the kit's avatar stack. */
function usedModels(occ: CoffreOccurrences): string[] {
  const seen: string[] = [];
  for (const u of occ.uses) {
    if (u.modelId && !seen.includes(u.modelId)) seen.push(u.modelId);
    if (seen.length === 4) break;
  }
  return seen;
}

/**
 * One Coffre term: the value MASKED behind its reveal pill, its type + note, the
 * models that have redacted it, a real occurrence count opening the uses modal,
 * and remove. Pure — every number is threaded in as `occ`.
 */
export function VaultRow({
  term,
  occ,
  onOpenUses,
  onRemove,
  scope,
  onShare,
}: {
  term: CoffreTerm;
  occ: CoffreOccurrences;
  onOpenUses: () => void;
  /** Absent = read-only row (a SHARED term) — no delete. */
  onRemove?: () => void;
  /** Sharing scope badge (kit): shown when an org exists. */
  scope?: string;
  /** Opens the « Partager » dialog for THIS term (personal rows only). */
  onShare?: () => void;
}) {
  const t = useT();
  const tone = hueForKind(term.token);
  const models = usedModels(occ);
  return (
    <div className="om-vault-row">
      <VaultTermPill value={term.value} tone={tone} />
      <div className="om-vault-meta">
        <span className="om-vault-meta-type">{coffreTypeLabel(term.token)}</span>
        <div className="om-vault-meta-sub">
          {term.note && <span className="om-vault-meta-note">{term.note}</span>}
          {models.length > 0 && (
            <div className="om-vault-models">
              {models.map((id) => (
                <span key={id} className="om-vault-model">
                  <ModelLogo
                    provider={findModelAny(id)?.provider ?? "openai-compat"}
                    modelId={id}
                    size={12}
                  />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {scope && <ScopeBadge scope={scope} />}
      {onShare && (
        <button type="button" className="om-vault-share" onClick={onShare} title={t.lists.vault.shareTip}>
          {t.lists.vault.share}
        </button>
      )}
      <button
        className={`om-vault-occ${occ.totalCount ? "" : " empty"}`}
        onClick={onOpenUses}
        title={t.lists.vault.usesTip}
      >
        <ShieldIcon size={13} />
        {t.lists.vault.occurrences(occ.totalCount)}
        <span className="om-vault-occ-conv">{t.lists.vault.conversations(occ.convCount)}</span>
      </button>
      {onRemove && (
        <button
          className="om-vault-del"
          onClick={onRemove}
          title={t.lists.vault.removeTip}
          aria-label={t.lists.vault.removeTip}
        >
          <TrashIcon size={16} />
        </button>
      )}
    </div>
  );
}
