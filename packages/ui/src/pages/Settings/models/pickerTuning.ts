import type { ProviderId } from "@openmasq/llm";
import { PROVIDER_ORDER } from "../../../components/ModelSelector/providers";

/** A vendor family earns a chip once it has this many models — below it the
 *  chip row would fill with one-off vendors; the long tail stays searchable.
 *  ⚠️ Le seuil était à 3 : sur les ~400 modèles du catalogue OpenRouter, cela faisait
 *  VINGT pastilles sur quatre lignes avant même la liste — la barre censée dégonfler
 *  l'écran l'encombrait plus que le reste (remonté le 11/08). À 10, il reste les
 *  familles qu'on cherche vraiment ; les autres se trouvent par la recherche, qui scanne
 *  aussi l'identifiant. */
export const FAMILY_CHIP_MIN = 10;

/** Order the default-model picker groups. The chat picker's `PROVIDER_ORDER` is the
 *  single source (rule 9 — the two lists had already drifted); this screen only
 *  PREPENDS the keyless web-session providers, which the desktop chat picker has none
 *  of. Same for the group LABEL: `providerGroupLabel`, never a second ternary. */
export const MODEL_PROVIDER_ORDER: ProviderId[] = [
  "openai-session",
  "anthropic-session",
  ...PROVIDER_ORDER,
];
