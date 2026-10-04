/**
 * The EN catalogue's « providerKeys » slice — translated from the source (`../fr/providerKeys.ts`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/providerKeys.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const providerKeys = {
  openai: {
    steps: [
      "Sign in at platform.openai.com.",
      "Open “API keys” (profile menu), or go to platform.openai.com/api-keys.",
      "Click “Create new secret key”, name it, then copy it (it starts with sk-).",
      "Paste it below. It is shown only once. Create a new one if you lose it.",
    ],
    note: "Requires a payment method and prepaid credits on your OpenAI account.",
  },
  anthropic: {
    steps: [
      "Sign in at console.anthropic.com.",
      "Open Settings → API keys (console.anthropic.com/settings/keys).",
      "Click “Create Key”, then copy the key (it starts with sk-ant-).",
      "Paste it below.",
    ],
    note: "Requires prepaid credits on your Anthropic account.",
  },
  google: {
    steps: [
      "Open Google AI Studio (aistudio.google.com) and sign in.",
      "Click “Get API key” → “Create API key” (aistudio.google.com/app/apikey).",
      "Copy the key (it starts with AIza).",
      "Paste it below.",
    ],
    note: "A limited free tier is available. Beyond it, you need a Google Cloud project.",
  },
  mistral: {
    steps: [
      "Sign in at console.mistral.ai.",
      "Open “API Keys” (console.mistral.ai/api-keys).",
      "Click “Create new key”, then copy it.",
      "Paste it below.",
    ],
    note: "Turn on billing for paid models. A free trial is available.",
  },
  deepseek: {
    steps: [
      "Create an account at platform.deepseek.com.",
      "Open “API keys” (platform.deepseek.com/api_keys).",
      "Click “Create new API key”, then copy it (it starts with sk-).",
      "Paste it below.",
    ],
    note: "Hosted in China: your masked messages are processed there. Add credits to the account to use it.",
  },
  openrouter: {
    steps: [
      "Create an account at openrouter.ai.",
      "Open “Keys” (openrouter.ai/keys).",
      "Click “Create Key”, name it, then copy it (it starts with sk-or-).",
      "Paste it below.",
    ],
    note: "One key, many models, some of them free. Paid models need credits. Where a model is hosted depends on the model.",
  },
  wrongPrefix: (provider, prefix) =>
    `A ${provider} key starts with ${prefix}. Check that you copied the right one.`,
  tooShort: "This key looks too short. Make sure you copied all of it.",
} satisfies Messages["providerKeys"];
