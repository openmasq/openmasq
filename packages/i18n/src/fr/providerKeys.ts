/**
 * The FR catalogue's « providerKeys » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/providerKeys.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const providerKeys = {
  openai: {
    steps: [
      "Connectez-vous sur platform.openai.com.",
      "Ouvrez « API keys » (menu profil), ou allez sur platform.openai.com/api-keys.",
      "Cliquez sur « Create new secret key », nommez-la, puis copiez-la (elle commence par sk-).",
      "Collez-la ci-dessous. Elle n'est affichée qu'une fois. Créez-en une nouvelle si vous la perdez.",
    ],
    note: "Nécessite un moyen de paiement et des crédits prépayés sur votre compte OpenAI.",
  },
  anthropic: {
    steps: [
      "Connectez-vous sur console.anthropic.com.",
      "Ouvrez Settings → API keys (console.anthropic.com/settings/keys).",
      "Cliquez sur « Create Key », puis copiez la clé (elle commence par sk-ant-).",
      "Collez-la ci-dessous.",
    ],
    note: "Nécessite des crédits prépayés sur votre compte Anthropic.",
  },
  google: {
    steps: [
      "Ouvrez Google AI Studio (aistudio.google.com) et connectez-vous.",
      "Cliquez sur « Get API key » → « Create API key » (aistudio.google.com/app/apikey).",
      "Copiez la clé (elle commence par AIza).",
      "Collez-la ci-dessous.",
    ],
    note: "Une offre gratuite limitée est disponible. Au-delà, il faut un projet Google Cloud.",
  },
  mistral: {
    steps: [
      "Connectez-vous sur console.mistral.ai.",
      "Ouvrez « API Keys » (console.mistral.ai/api-keys).",
      "Cliquez sur « Create new key », puis copiez-la.",
      "Collez-la ci-dessous.",
    ],
    note: "Activez la facturation pour les modèles payants. Un essai gratuit est disponible.",
  },
  deepseek: {
    steps: [
      "Créez un compte sur platform.deepseek.com.",
      "Ouvrez « API keys » (platform.deepseek.com/api_keys).",
      "Cliquez sur « Create new API key », puis copiez-la (elle commence par sk-).",
      "Collez-la ci-dessous.",
    ],
    note: "Hébergé en Chine : vos messages masqués y sont traités. Ajoutez des crédits au compte pour l'utiliser.",
  },
  openrouter: {
    steps: [
      "Créez un compte sur openrouter.ai.",
      "Ouvrez « Keys » (openrouter.ai/keys).",
      "Cliquez sur « Create Key », nommez-la, puis copiez-la (elle commence par sk-or-).",
      "Collez-la ci-dessous.",
    ],
    note: "Une clé, de nombreux modèles, dont certains gratuits. Les modèles payants demandent des crédits. L'hébergement dépend du modèle.",
  },
  wrongPrefix: (provider, prefix) =>
    `Une clé ${provider} commence par ${prefix}. Vérifiez que vous avez copié la bonne.`,
  tooShort: "Cette clé semble trop courte. Vérifiez que vous l'avez copiée en entier.",
} satisfies Messages["providerKeys"];
