import { useMemo, useState } from "react";
import { useT } from "../../../i18n";
import { type ProviderId } from "@openmasq/llm";
import { selectableModels } from "../../../prompt/models";
import { visibleModels, type UnavailableReason } from "../../../send/modelAvailability";
import { favoriteSet } from "../../../components/ModelSelector/simpleList";
import { ModelDetail } from "../ModelDetail";
import { useAppSelector } from "../../../state/redux";
import { selectBillingCache } from "../../../state/settings/settingsCache";
import { canPitchSubscription } from "../../../state/billing/billing";
import type { OrgProfileInfo } from "../../../host";
import { ProviderGroup } from "./ProviderGroup";
import { DefaultModelSummary } from "./DefaultModelSummary";
import { ProviderAccess } from "./ProviderAccess";
import { LocalModelSection, type LocalModelProps } from "./LocalModelSection";
import { ModelsTabModals } from "./ModelsTabModals";
import { ModelFilterBar } from "./ModelFilterBar";
import { filterModels, modelFamilies, modelPriceTier, type PriceTier } from "../../../prompt/modelFilter";

// The picker's settings (family-chip threshold, group order) live
// alongside it — `pickerTuning.ts` — with the WHY of each value.
import { FAMILY_CHIP_MIN, MODEL_PROVIDER_ORDER } from "./pickerTuning";

/**
 * The "Modèle" section — a dedicated sidebar screen for the DEFAULT model used by
 * every new conversation (moved out of Settings → Compte). Grouped model cards on the
 * left, a sticky `ModelDetail` panel on the right. The API-key control is the provider
 * CHIP at the top of the tab (`ProviderAccess`, « Avec une clé API ») — a group header
 * only STATES whether that provider's key is stored (the pill), it no longer carries a
 * second gear for the same modal. The page only renders + collects the choice; the
 * store write arrives as `onPick` (it persists `Settings.defaultModelId`).
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
  local,
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
   *  the provider's chip at the top is how a `no_key` provider is unlocked. */
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** Switch to Réglages → Paiement (the free-models explainer's subscribe path). */
  onOpenBilling?: () => void;
  /** Base URL of a model running on the user's OWN machine (Ollama, LM Studio… —
   *  `Settings.openaiCompatBaseUrl`). Lives on THIS tab: a local model is a model
   *  choice, not an account matter. */
  local: LocalModelProps;
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
  // Which provider's key modal is open (opened from a provider chip, `ProviderAccess`).
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
  // The price filter only exists when there is something to filter BY: a list whose
  // models all sit in one tier (an account on free models only) would offer a menu
  // with one useful answer.
  const priceTiers = useMemo(
    () => new Set(pickerModels.map((m) => modelPriceTier(m.id))).size,
    [pickerModels],
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
              showPrice={priceTiers > 1}
              matchCount={filtered.length}
            />
            {filtered.length === 0 && (
              <p className="model-filter-empty">
                {t.modelsTab.noMatch(query.trim())}
              </p>
            )}
            {MODEL_PROVIDER_ORDER.map((pid) => (
              <ProviderGroup
                key={pid}
                pid={pid}
                models={pickerModels.filter((m) => m.provider === pid && shown.has(m.id))}
                hasKey={!!keyConfigured?.has(pid)}
                unavailableModels={unavailableModels}
                defaultModelId={defaultModelId}
                favSet={favSet}
                onPreview={setPreviewId}
                onPick={onPick}
                onAccessInfo={() => setFreeInfoOpen(true)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
          {previewModel && (
            <aside className="model-detail-panel">
              <ModelDetail model={previewModel} />
            </aside>
          )}
      </div>
      {/* The "subscription via CLI" opt-ins are no longer a bottom-of-page section:
          they live in their badge, up top (`AgentAccessModal`). What stays down here
          is the « Avancé » fold: the model on the user's own machine. */}
      <LocalModelSection {...local} />

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
