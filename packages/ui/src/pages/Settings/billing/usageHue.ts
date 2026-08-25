import { PROVIDERS } from "@openmasq/llm";
import { findModelAny } from "../../../prompt/models";
import { hueForProvider } from "../../../prompt/providerHue";

/** Hue + vendor label for a model id, resolved through the registry. La table
 *  fournisseur→teinte vit dans `prompt/providerHue.ts` : la console web l'empile aussi. */
export function modelStyle(modelId: string): { hue: string; vendor: string } {
  const provider = findModelAny(modelId)?.provider;
  return {
    hue: hueForProvider(provider),
    vendor: provider ? PROVIDERS[provider]?.label ?? "" : "",
  };
}
