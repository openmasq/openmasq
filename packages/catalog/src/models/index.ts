/**
 * Normalized MODEL catalog — the single source of truth for "which models exist"
 * shared by the desktop UI and the org admin console.
 *
 * The raw data still lives in `@openmasq/llm` (`MODELS` + the id-keyed side
 * tables). This module flattens all of that into ONE enriched list so a consumer
 * never has to re-join the pricing/context/tpm maps by hand, and so the admin
 * surface can list exactly the ids the desktop routes to (no more brand-slug drift).
 */
import {
  MODELS,
  PROVIDERS,
  MODEL_PRICING,
  MODEL_CONTEXT,
  MODEL_TPM,
  findModel,
  type ModelInfo,
  type ModelPrice,
  type ProviderId,
  type ProviderInfo,
} from "@openmasq/llm";

export type { ProviderId, ProviderInfo, ModelInfo, ModelPrice };
// Re-export the raw registry for callers that still need it (provider metadata,
// key URLs, `findModel`, …). The catalog is additive, not a replacement.
export { MODELS, PROVIDERS, findModel };

/** One row of the unified model catalog: the model plus its enriched metadata. */
export interface CatalogModel {
  /** Provider-specific model id sent to the API. */
  id: string;
  /** Human friendly label shown in the UI. */
  label: string;
  provider: ProviderId;
  /** Human brand of the provider (from `PROVIDERS[provider].label`). */
  vendor: string;
  /** Max context window in tokens, when known (omitted for local). */
  contextTokens?: number;
  /** Estimated list price, USD / 1M tokens, when known. */
  pricing?: ModelPrice;
  /** Rate limit (tokens/minute), when we have real data. */
  tpm?: number;
  /** Accepts image attachments (absent ⇒ text only) — from `ModelInfo.vision`. */
  vision?: boolean;
  /** NO function calling (a `tools` request 400s upstream) — from `ModelInfo.noTools`. */
  noTools?: boolean;
}

function toCatalogModel(m: ModelInfo): CatalogModel {
  return {
    id: m.id,
    label: m.label,
    provider: m.provider,
    vendor: PROVIDERS[m.provider]?.label ?? m.provider,
    contextTokens: MODEL_CONTEXT[m.id],
    pricing: MODEL_PRICING[m.id],
    tpm: MODEL_TPM[m.id],
    // The registry's ONLY two capability flags — propagated, not re-derived, so a
    // catalog consumer (admin console, a router) can't disagree with the desktop.
    ...(m.vision ? { vision: true } : {}),
    ...(m.noTools ? { noTools: true } : {}),
  };
}

/** Every API-key model the app can reach. No entry present today is dropped. */
export const MODEL_CATALOG: CatalogModel[] = MODELS.map((m) => toCatalogModel(m));

/** Look up a catalog row by model id. */
export function findCatalogModel(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/**
 * La LISTE SIMPLIFIÉE du sélecteur de modèles — ce que voit quelqu'un qui ne veut pas
 * choisir. Elle vit ici, et pas dans l'UI, parce que c'est une liste GOUVERNABLE : la
 * console d'org doit pouvoir dire ce qu'un membre voit par défaut (règle 9, comme les
 * connecteurs et les catégories de redaction).
 *
 * ⚠️ **Que des ids OpenRouter, à dessein.** OpenRouter marche sur la clé PERSONNELLE de
 * l'utilisateur : la vue simplifiée reste donc utilisable sans abonnement. Les mêmes
 * modèles côté Scaleway sont *platform-provided* — la liste se serait
 * affichée entièrement grisée pour qui n'a pas souscrit, ce qui est le contraire d'une
 * simplification.
 *
 * L'ordre EST l'affichage : gratuits d'abord, parce que c'est ce qu'on essaie sans rien
 * engager. Les ids ont été vérifiés le 02/08/2026 dans le catalogue live
 * (`GET https://openrouter.ai/api/v1/models`) — la règle du registre interdit d'en
 * deviner un, et un `:free` se fait retirer sans préavis.
 */
export const SIMPLE_MODEL_IDS: readonly string[] = Object.freeze([
  // Le premier EST le modèle par défaut des nouvelles conversations
  // (`@openmasq/ui` `DEFAULT_MODEL_ID`) : la première ligne de la liste et le modèle
  // sur lequel on écrit sans rien régler doivent être le même, sinon la liste s'ouvre
  // en désignant autre chose que ce qui tourne.
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "openai/gpt-5.6-luna",
  "moonshotai/kimi-k2.6",
  "deepseek/deepseek-chat-v3.1",
]);

/** Les modèles de la vue simplifiée, dans l'ordre de la liste, ignorant un id retiré du
 *  registre — une liste figée ne doit jamais faire disparaître le sélecteur. */
export function simpleModels(): CatalogModel[] {
  return SIMPLE_MODEL_IDS.map((id) => findCatalogModel(id)).filter((m): m is CatalogModel => !!m);
}
