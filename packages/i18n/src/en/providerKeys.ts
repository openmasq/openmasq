/**
 * Tranche « providerKeys » du catalogue EN — traduit de la source (`../fr/providerKeys.ts`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/providerKeys.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const providerKeys = {
  openai: {
    steps: [
      "Sign in at platform.openai.com.",
      "Open “API keys” (profile menu), or go to platform.openai.com/api-keys.",
      "Click “Create new secret key”, name it, then copy it (it starts with sk-).",
      "Paste it below. It is shown only once — create another if you lose it.",
    ],
    note: "Requires a payment method and credit in your OpenAI account's billing.",
  },
  anthropic: {
    steps: [
      "Sign in at console.anthropic.com.",
      "Open Settings → API keys (console.anthropic.com/settings/keys).",
      "Click “Create Key”, then copy the key (it starts with sk-ant-).",
      "Paste it below.",
    ],
    note: "Requires credit in your Anthropic account's billing.",
  },
  google: {
    steps: [
      "Open Google AI Studio (aistudio.google.com) and sign in.",
      "Click “Get API key” → “Create API key” (aistudio.google.com/app/apikey).",
      "Copy the key (it starts with AIza).",
      "Paste it below.",
    ],
    note: "Limited free usage exists; a Google Cloud project is needed to go beyond it.",
  },
  mistral: {
    steps: [
      "Sign in at console.mistral.ai.",
      "Open “API Keys” (console.mistral.ai/api-keys).",
      "Click “Create new key”, then copy it.",
      "Paste it below.",
    ],
    note: "Turn on billing for the paid models; a trial tier exists.",
  },
  deepseek: {
    steps: [
      "Create an account at platform.deepseek.com.",
      "Open “API keys” (platform.deepseek.com/api_keys).",
      "Click “Create new API key”, then copy it (it starts with sk-).",
      "Paste it below.",
    ],
    note: "Hosted in China: your messages (already masked) transit there. Add credit to the account to use it.",
  },
  openrouter: {
    steps: [
      "Create an account at openrouter.ai.",
      "Open “Keys” (openrouter.ai/keys).",
      "Click “Create Key”, name it, then copy it (it starts with sk-or-).",
      "Paste it below.",
    ],
    note: "One key, many models (free ones included). Paid models need credit; hosting depends on the model.",
  },
  wrongPrefix: (provider, prefix) =>
    `A ${provider} key starts with ${prefix} — check that you copied the right one.`,
  tooShort: "This key looks short: copy it in full.",
} satisfies Messages["providerKeys"];
