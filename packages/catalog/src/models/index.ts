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
 * The SIMPLIFIED LIST for the model picker — what someone who doesn't want to
 * choose sees. It lives here, not in the UI, because it's a GOVERNABLE list: the
 * org console must be able to say what a member sees by default (rule 9, like
 * connectors and redaction categories).
 *
 * ⚠️ **OpenRouter ids ONLY, by design.** OpenRouter runs on the user's PERSONAL
 * key: the simplified view therefore stays usable without a subscription. The same
 * models on the Scaleway side are *platform-provided* — the list would have
 * displayed entirely greyed out for anyone who hasn't subscribed, which is the opposite of
 * a simplification.
 *
 * The order IS the display: free ones first, because that's what you try without committing
 * to anything. The ids were verified on 02/08/2026 in the live catalogue
 * (`GET https://openrouter.ai/api/v1/models`) — the registry rule forbids
 * guessing one, and a `:free` gets pulled with no notice.
 */
export const SIMPLE_MODEL_IDS: readonly string[] = Object.freeze([
  // The first one IS the default model for new conversations
  // (`@openmasq/ui` `DEFAULT_MODEL_ID`): the list's first row and the model
  // you send on without changing anything must be the same one, or the list opens
  // pointing at something other than what's actually running.
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "openai/gpt-5.6-luna",
  "moonshotai/kimi-k2.6",
  "deepseek/deepseek-chat-v3.1",
]);

/** The simplified view's models, in list order, skipping an id removed from the
 *  registry — a frozen list must never make the picker disappear. */
export function simpleModels(): CatalogModel[] {
  return SIMPLE_MODEL_IDS.map((id) => findCatalogModel(id)).filter((m): m is CatalogModel => !!m);
}
