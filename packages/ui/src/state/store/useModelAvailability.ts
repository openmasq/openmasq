import { useMemo, useRef, useSyncExternalStore } from "react";
import { modelsVersion, onModelsChanged } from "@openmasq/llm";
import type { BillingSubscription, CreditBalance, Host, OrgProfileInfo } from "../../host";
import type { Conversation, Settings } from "../../types";
import { isModelAllowed } from "../../privacy/orgAllowList";
import { effectiveDefaultModelId } from "../../prompt/defaultModel";
import { ALL_MODELS, DEFAULT_MODEL_ID, findModelAny } from "../../prompt/models";
import { isAutoModelId } from "../../send/autoRoute";
import { modelUnavailableReason, type UnavailableReason } from "../../send/modelAvailability";
import { resolveEffectivePlatform } from "../../send/routing";
import {
  useAntigravityCliProbe,
  useClaudeCliProbe,
  useCodexCliProbe,
  useLocalEndpointProbe,
} from "../effects/useAvailabilityProbes";

/**
 * Which models can't SEND right now, and why — computed with the SAME
 * `modelUnavailableReason` the fail-closed send gate uses, so a flagged row and a
 * refused send always agree (rule 9). Org-blocked models are HIDDEN by
 * `selectableModels`, not greyed, so they are absent here on purpose.
 */
export function useModelAvailability({
  host,
  settings,
  keyConfigured,
  orgProfile,
  personalCredits,
  personalSub,
  conversations,
  activeId,
}: {
  host: Host;
  settings: Settings;
  keyConfigured: Set<string>;
  orgProfile: OrgProfileInfo | null;
  personalCredits: CreditBalance | null;
  personalSub: BillingSubscription | null;
  conversations: Conversation[];
  activeId: string | null;
}) {
  const { localEndpointReachable, localEndpointReachableRef } = useLocalEndpointProbe(
    host,
    settings.openaiCompatBaseUrl,
    settings.openaiCompatModelIds,
  );
  const { claudeCliDetected, claudeCliReady, claudeCliReadyRef } = useClaudeCliProbe(host, settings.claudeCliEnabled);
  const { codexCliDetected, codexCliReady, codexCliReadyRef } = useCodexCliProbe(host, settings.codexCliEnabled);
  const { antigravityCliDetected, antigravityCliReady, antigravityCliReadyRef } = useAntigravityCliProbe(
    host,
    settings.antigravityCliEnabled,
  );

  // The live-catalogue merge mutates MODELS IN PLACE, which no dep below can see.
  const registryVersion = useSyncExternalStore(onModelsChanged, modelsVersion, modelsVersion);
  const unavailableModels = useMemo(() => {
    const map = new Map<string, UnavailableReason>();
    for (const m of ALL_MODELS) {
      const reason = modelUnavailableReason({
        model: m,
        effectivePlatform: resolveEffectivePlatform(m.provider, m.id, settings.billingMode, keyConfigured),
        orgProfile,
        personalCredits,
        personalSub,
        keyConfigured,
        openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
        localEndpointReachable,
        claudeCliReady,
        codexCliReady,
        antigravityCliReady,
      });
      if (reason) map.set(m.id, reason);
    }
    return map as ReadonlyMap<string, UnavailableReason>;
  }, [
    keyConfigured,
    settings.billingMode,
    settings.openaiCompatBaseUrl,
    localEndpointReachable,
    claudeCliReady,
    codexCliReady,
    antigravityCliReady,
    orgProfile,
    personalCredits,
    personalSub,
    registryVersion,
  ]);

  // Preferred model for a NEW chat, via a ref so the creating callback stays stable: the
  // active conversation's model, else the access path's default, else the built-in one.
  // AUTO is a MODE, not a registry id, so it bypasses the existence check.
  const newChatModelRef = useRef(DEFAULT_MODEL_ID);
  const orgBlocks = (id: string | undefined): boolean => !isModelAllowed(id, orgProfile?.allowedModelIds);
  const defaultModelId = effectiveDefaultModelId(settings.defaultModelId, unavailableModels, orgProfile?.allowedModelIds);
  newChatModelRef.current =
    [
      conversations.find((c) => c.id === activeId)?.modelId,
      isAutoModelId(defaultModelId) ? defaultModelId : findModelAny(defaultModelId)?.id,
    ].find((id) => id && !orgBlocks(id)) || DEFAULT_MODEL_ID;

  return {
    localEndpointReachableRef,
    claudeCliDetected,
    claudeCliReadyRef,
    codexCliDetected,
    codexCliReadyRef,
    antigravityCliDetected,
    antigravityCliReadyRef,
    unavailableModels,
    newChatModelRef,
  };
}
