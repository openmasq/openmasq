// SDK-FREE price/context tables. The `@openmasq/llm` barrel (`index.ts`) pulls
// in the provider SDK clients; this subpath re-exports ONLY the pricing/context
// data from `models.ts` (which imports TYPES only, no SDKs) so the backend and
// the redact-fn container can price token usage without bundling any provider SDK.
export {
  MODEL_PRICING,
  MODEL_CONTEXT,
  isFreeModel,
  // The FREE MODE list goes through this subpath for a precise reason: the
  // GATEWAY must re-read it (rule 7 — the picker is not a boundary), and it
  // only imports `@openmasq/credits`, which only imports this.
  FREE_MODE_MODEL_IDS,
  isFreeModeModel,
  type ModelPrice,
} from "./models/index.js";
