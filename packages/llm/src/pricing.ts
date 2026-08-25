// SDK-FREE price/context tables. The `@openmasq/llm` barrel (`index.ts`) pulls
// in the provider SDK clients; this subpath re-exports ONLY the pricing/context
// data from `models.ts` (which imports TYPES only, no SDKs) so the backend and
// the redact-fn container can price token usage without bundling any provider SDK.
export {
  MODEL_PRICING,
  MODEL_CONTEXT,
  isFreeModel,
  // La liste du MODE GRATUIT passe par ce sous-chemin pour une raison précise : la
  // PASSERELLE doit la relire (règle 7 — le sélecteur n'est pas une frontière), et elle
  // n'importe que `@openmasq/credits`, qui n'importe que ceci.
  FREE_MODE_MODEL_IDS,
  isFreeModeModel,
  type ModelPrice,
} from "./models/index.js";
