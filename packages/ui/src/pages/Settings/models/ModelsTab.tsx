import { useMemo, useState } from "react";
import { useT } from "../../../i18n";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { CheckIcon, FamilyLogo, SettingsIcon } from "../../../components/brand";
import { selectableModels } from "../../../prompt/models";
import { visibleModels, type UnavailableReason } from "../../../send/modelAvailability";
import { providerGroupLabel } from "../../../components/ModelSelector/providers";
import { favoriteSet } from "../../../components/ModelSelector/simpleList";
import { providerGroupStatus } from "./providerGroupStatus";
import { KEYED_PROVIDERS } from "../shared";
import { ModelDetail } from "../ModelDetail";
import { useAppSelector } from "../../../state/redux";
import { selectBillingCache } from "../../../state/settings/settingsCache";
import { canPitchSubscription } from "../../../state/billing/billing";
import type { OrgProfileInfo } from "../../../host";
import { ModelCard } from "./ModelCard";
import { DefaultModelSummary } from "./DefaultModelSummary";
import { ProviderAccess } from "./ProviderAccess";
import { LocalModelSection } from "./LocalModelSection";
import { ModelsTabModals } from "./ModelsTabModals";
import { ModelFilterBar } from "./ModelFilterBar";
import { filterModels, modelFamilies, subgroupByFamily, type PriceTier } from "../../../prompt/modelFilter";

// The picker's settings (family-chip threshold, group order) live
// alongside it — `pickerTuning.ts` — with the WHY of each value.
import { FAMILY_CHIP_MIN, MODEL_PROVIDER_ORDER } from "./pickerTuning";

/**
 * The "Modèle" section — a dedicated sidebar screen for the DEFAULT model used by
 * every new conversation (moved out of Settings → Compte). Grouped model cards on the
 * left, a sticky `ModelDetail` panel on the right. The API-key control is ONE gear PER
 * PROVIDER (in each group header), beside a chip that states whether that provider's
 * key is already stored — not a per-card gear. The page only renders + collects the
 * choice; the store write arrives as `onPick` (it persists `Settings.defaultModelId`).
 */
export function ModelsTab({
  defaultModelId,
  onPick,
  onSetApiKey,
  onClearApiKey,
  onConnectOpenRouter,
  keyConfigured,
  orgProfile,
  unavailableModels,
  onOpenBilling,
  localModelUrl,
  onLocalModelUrl,
  claudeCliEnabled,
  onClaudeCliEnabled,
  codexCliEnabled,
  onCodexCliEnabled,
  antigravityCliEnabled,
  onAntigravityCliEnabled,
  favoriteModels,
  onToggleFavorite,
}: {
  defaultModelId?: string;
  /** Persist the chosen default model (store-backed). */
  onPick: (id: string) => void;
  /** Store-backed key setter (writes encrypted via host.keys + refreshes state). */
  onSetApiKey: (id: string, value: string) => void | Promise<void>;
  /** Remove a provider's key (the modal offers it when there is one). */
  onClearApiKey?: (id: string) => void | Promise<void>;
  /** OAuth PKCE « Connecter mon compte OpenRouter » (`state/connectOpenRouter.ts`).
   *  Absent on a platform without this flow ⇒ the button is not drawn. */
  onConnectOpenRouter?: () => Promise<boolean>;
  /** Providers whose API key is already stored on this machine — drives the per-provider
   *  "Clé enregistrée / Aucune clé" chip so the list says which are ready to use. */
  keyConfigured?: ReadonlySet<string>;
  /** The signed-in member's org authorization (null = solo user). */
  orgProfile?: OrgProfileInfo | null;
  /** Model id → why it can't send. Those cards render GREYED and can't be made default;
   *  the group's key gear is how a `no_key` provider is unlocked. */
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** Switch to Réglages → Paiement (the free-models explainer's subscribe path). */
  onOpenBilling?: () => void;
  /** Base URL of a model running on the user's OWN machine (Ollama, LM Studio… —
   *  `Settings.openaiCompatBaseUrl`). Lives on THIS tab: a local model is a model
   *  choice, not an account matter. */
  localModelUrl: string;
  onLocalModelUrl: (url: string) => void;
  /** Opt-in `Settings.claudeCliEnabled` / `codexCliEnabled` — absent ⇒ agent
   *  badge not drawn (web aperçu, host with no probe). */
  claudeCliEnabled?: boolean;
  onClaudeCliEnabled?: (on: boolean) => void;
  codexCliEnabled?: boolean;
  onCodexCliEnabled?: (on: boolean) => void;
  antigravityCliEnabled?: boolean;
  onAntigravityCliEnabled?: (on: boolean) => void;
  /** Favorite models (the chat picker's short list) + the star toggle.
   *  Absent ⇒ no star on the grid (web aperçu, test harness). */
  favoriteModels?: string[];
  onToggleFavorite?: (id: string) => void;
}) {
  // Catalogue default shown fully starred when empty (consistent with the chat picker
  // and with materializing on the first action) — `favoriteSet`, not a raw Set.
  const favSet = favoriteSet(favoriteModels);
  // Which provider's key modal is open (opened from a model's gear).
  const [keyProvider, setKeyProvider] = useState<ProviderId | null>(null);
  const t = useT();
  // The « Modèles gratuits » explainer, opened from a card's badge.
  const [freeInfoOpen, setFreeInfoOpen] = useState(false);
  // Only a KNOWN-free, non-org account gets the subscribe pitch — the prefetch has
  // already filled this cache by the time Settings is on screen.
  const { sub } = useAppSelector(selectBillingCache);
  const pitchSubscription = canPitchSubscription({ sub, inOrg: !!orgProfile });
  // Model whose detail panel is shown (hovered/focused card, else the selected one).
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Picker search + vendor-family + price-tier filters (drive the OpenRouter
  // ~320-model group).
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<string | null>(null);
  const [price, setPrice] = useState<PriceTier | null>(null);

  // What the user can ACTUALLY send: subscription, keys entered,
  // free ones — plus the current default model, which must never disappear from its
  // own setting. Models missing a key/credits are no longer listed at all.
  const pickerModels = useMemo(
    () => visibleModels(selectableModels(orgProfile?.allowedModelIds), unavailableModels, previewId ?? defaultModelId),
    [orgProfile?.allowedModelIds, unavailableModels, previewId, defaultModelId],
  );
  const families = useMemo(
    () => modelFamilies(pickerModels, FAMILY_CHIP_MIN),
    [pickerModels],
  );
  const filtered = useMemo(
    () => filterModels(pickerModels, query, family, price),
    [pickerModels, query, family, price],
  );
  const shown = new Set(filtered.map((m) => m.id));
  const previewModel =
    pickerModels.find((mdl) => mdl.id === (previewId ?? defaultModelId)) ?? pickerModels[0];

  return (
    <>
      {/* WHERE the models come from first (what lengthens the list), the list
          after — always unfolded: it's the filter bar that makes it navigable,
          not a collapse. The two paths (a key, an agent already installed) live side by
          side: `ProviderAccess.tsx` says why they aren't conflated. */}
      <div className="cv-eyebrow mb-3">{t.modelsTab.sourcesEyebrow}</div>
      <ProviderAccess
        keyConfigured={keyConfigured}
        hasSubscription={!pitchSubscription}
        onOpenKey={setKeyProvider}
        onOpenBilling={onOpenBilling}
        byoKeysBlocked={orgProfile?.byoKeysAllowed === false}
        organizationName={orgProfile?.organizationName}
        claudeCliEnabled={claudeCliEnabled}
        onClaudeCliEnabled={onClaudeCliEnabled}
        codexCliEnabled={codexCliEnabled}
        onCodexCliEnabled={onCodexCliEnabled}
        antigravityCliEnabled={antigravityCliEnabled}
        onAntigravityCliEnabled={onAntigravityCliEnabled}
      />
      {/* The RESULT of the setting, stated — before the list that serves to change it. */}
      <DefaultModelSummary
        model={pickerModels.find((m) => m.id === defaultModelId)}
        onPreview={setPreviewId}
      />
      <div className="cv-eyebrow mt-4 mb-3">{t.modelsTab.availableEyebrow(pickerModels.length)}</div>
      <div className="model-picker-split">
          <div className="model-picker-list" onMouseLeave={() => setPreviewId(null)}>
            <ModelFilterBar
              query={query}
              onQuery={setQuery}
              family={family}
              onFamily={setFamily}
              families={families}
              price={price}
              onPrice={setPrice}
              matchCount={filtered.length}
            />
            {filtered.length === 0 && (
              <p className="model-filter-empty">
                {t.modelsTab.noMatch(query.trim())}
              </p>
            )}
            {MODEL_PROVIDER_ORDER.map((pid) => {
              const group = pickerModels.filter((m) => m.provider === pid && shown.has(m.id));
              if (group.length === 0) return null;
              const keyed = KEYED_PROVIDERS.includes(pid);
              const hasKey = !!keyConfigured?.has(pid);
              // What this group's header says about availability + its key pill — the
              // wording rules live in `providerGroupStatus.ts`.
              const { groupReason, groupChip, keyStatus } = providerGroupStatus({
                pid,
                group,
                keyed,
                hasKey,
                unavailableModels,
                t,
              });
              // Sub-group the provider's cards by vendor family — clarifies the dense
              // aggregator/platform groups (OpenRouter, Scaleway — both multi-vendor).
              // Single-family providers render flat (no redundant sub-header).
              const subgroups = subgroupByFamily(group);
              const showSubgroups = subgroups.length > 1;
              return (
                <div key={pid} className="model-platform-group">
                  <div className="model-platform-header">
                    <span className="cv-eyebrow">
                      {providerGroupLabel(pid)}
                    </span>
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
                        <button
                          type="button"
                          className="model-gear"
                          title={t.modelsTab.keyGearTip(hasKey, PROVIDERS[pid].label)}
                          aria-label={t.modelsTab.keyGearTip(hasKey, PROVIDERS[pid].label)}
                          onClick={() => setKeyProvider(pid)}
                        >
                          <SettingsIcon size={14} />
                        </button>
                      </div>
                        )}
                      </div>
                    )}
                  </div>
                  {subgroups.map((sub) => (
                    <div key={sub.key} className="model-subgroup">
                      {/* A provider that mixes vendors (OpenRouter/Scaleway)
                          gets a vendor-family sub-header; a single-family provider (native
                          OpenAI/Anthropic/…) renders the grid flat, no redundant header. */}
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
                            // Per-card chip only when the group is MIXED — a uniform group
                            // states the reason once in its header (above) — AND the
                            // provider is not keyed: a keyed provider's key pill already
                            // says the unlock (« Clé ou abonnement »), so stamping
                            // « Abonnement requis » on every paid card of a mixed group
                            // (OpenRouter: free rows usable, ~300 paid rows blocked) is
                            // pure repetition. The card stays greyed + titled either way.
                            showChip={!groupReason && !keyed}
                            onPreview={setPreviewId}
                            onPick={onPick}
                            onAccessInfo={() => setFreeInfoOpen(true)}
                            favorite={favSet.has(m.id)}
                            onToggleFavorite={onToggleFavorite}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {previewModel && (
            <aside className="model-detail-panel">
              <ModelDetail model={previewModel} />
            </aside>
          )}
      </div>
      <p className="modal-note">
        {t.modelsTab.gearNote}
      </p>

      {/* The "subscription via CLI" opt-ins are no longer a bottom-of-page section:
          they live in their badge, up top (`AgentAccessModal`). */}
      <LocalModelSection url={localModelUrl} onUrl={onLocalModelUrl} />

      <ModelsTabModals
        freeInfoOpen={freeInfoOpen}
        onCloseFreeInfo={() => setFreeInfoOpen(false)}
        onSubscribe={
          pitchSubscription && onOpenBilling
            ? () => {
                setFreeInfoOpen(false);
                onOpenBilling();
              }
            : undefined
        }
        keyProvider={keyProvider}
        onCloseKey={() => setKeyProvider(null)}
        onSetApiKey={onSetApiKey}
        onClearApiKey={onClearApiKey}
        keyConfigured={keyConfigured}
        onConnectOpenRouter={onConnectOpenRouter}
      />
    </>
  );
}
