import type { ModelInfo, ProviderId } from "@openmasq/llm";
import { CheckIcon, FamilyLogo } from "../../../components/brand";
import { providerGroupLabel } from "../../../components/ModelSelector/providers";
import { useT } from "../../../i18n";
import { subgroupByFamily } from "../../../prompt/modelFilter";
import type { UnavailableReason } from "../../../send/modelAvailability";
import { KEYED_PROVIDERS } from "../shared";
import { ModelCard } from "./ModelCard";
import { providerGroupStatus } from "./providerGroupStatus";

/**
 * ONE provider's block of the default-model grid: its header (label · availability chip ·
 * key pill — the pill only STATES whether a key is stored; the key itself is set from the
 * provider chip at the top of the tab, `ProviderAccess`), then its cards, sub-grouped by
 * vendor family when the provider mixes vendors (OpenRouter, Scaleway). Extracted from
 * `ModelsTab` so the tab stays the page's arrangement and this the group's shape.
 */
export function ProviderGroup({
  pid,
  models,
  hasKey,
  unavailableModels,
  defaultModelId,
  favSet,
  onPreview,
  onPick,
  onAccessInfo,
  onToggleFavorite,
}: {
  pid: ProviderId;
  /** The provider's models that survived the filters — empty ⇒ nothing is drawn. */
  models: ModelInfo[];
  hasKey: boolean;
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  defaultModelId?: string;
  favSet: ReadonlySet<string>;
  onPreview: (id: string) => void;
  onPick: (id: string) => void;
  onAccessInfo: () => void;
  onToggleFavorite?: (id: string) => void;
}) {
  const t = useT();
  if (models.length === 0) return null;
  const keyed = KEYED_PROVIDERS.includes(pid);
  // What this group's header says about availability + its key pill — the wording
  // rules live in `providerGroupStatus.ts`.
  const { groupReason, groupChip, keyStatus } = providerGroupStatus({
    pid,
    group: models,
    keyed,
    hasKey,
    unavailableModels,
    t,
  });
  // Sub-group the provider's cards by vendor family — clarifies the dense
  // aggregator/platform groups (OpenRouter, Scaleway — both multi-vendor).
  // Single-family providers render flat (no redundant sub-header).
  const subgroups = subgroupByFamily(models);
  const showSubgroups = subgroups.length > 1;
  return (
    <div className="model-platform-group">
      <div className="model-platform-header">
        <span className="cv-eyebrow">{providerGroupLabel(pid)}</span>
        {(groupChip || keyed) && (
          <div className="model-platform-right">
            {groupChip && (
              <span className="model-unavailable" title={groupChip.title}>
                {groupChip.chip}
              </span>
            )}
            {keyed && (
              <div className="model-platform-key">
                <span
                  className={`model-key-status${keyStatus!.check ? " on" : ""}${keyStatus!.blocked ? " blocked" : ""}`}
                  title={keyStatus!.title}
                >
                  {keyStatus!.check && <CheckIcon size={11} />}
                  {keyStatus!.text}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {subgroups.map((sub) => (
        <div key={sub.key} className="model-subgroup">
          {/* A provider that mixes vendors (OpenRouter/Scaleway) gets a vendor-family
              sub-header; a single-family provider (native OpenAI/Anthropic/…) renders
              the grid flat, no redundant header. */}
          {showSubgroups && (
            <div className="model-subhead">
              <FamilyLogo familyKey={sub.key} label={sub.label} size={15} />
              <span className="model-subhead-label">{sub.label}</span>
              <span className="model-subhead-count">{sub.models.length}</span>
            </div>
          )}
          <div className="model-grid">
            {sub.models.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                active={m.id === defaultModelId}
                reason={unavailableModels?.get(m.id)}
                // Per-card chip only when the group is MIXED — a uniform group states
                // the reason once in its header (above) — AND the provider is not
                // keyed: a keyed provider's key pill already says the unlock (« Clé ou
                // abonnement »), so stamping « Abonnement requis » on every paid card
                // of a mixed group (OpenRouter: free rows usable, ~300 paid rows
                // blocked) is pure repetition. The card stays greyed + titled either way.
                showChip={!groupReason && !keyed}
                onPreview={onPreview}
                onPick={onPick}
                onAccessInfo={onAccessInfo}
                favorite={favSet.has(m.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
