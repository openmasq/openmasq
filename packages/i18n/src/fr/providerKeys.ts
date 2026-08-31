/**
 * Tranche « providerKeys » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/providerKeys.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const providerKeys = {
  openai: {
    steps: [
      "Connectez-vous sur platform.openai.com.",
      "Ouvrez « API keys » (menu profil), ou allez sur platform.openai.com/api-keys.",
      "Cliquez « Create new secret key », nommez-la, puis copiez-la (elle commence par sk-).",
      "Collez-la ci-dessous. Elle n'est affichée qu'une fois — recréez-en une si vous la perdez.",
    ],
    note: "Nécessite un moyen de paiement et des crédits dans la facturation de votre compte OpenAI.",
  },
  anthropic: {
    steps: [
      "Connectez-vous sur console.anthropic.com.",
      "Ouvrez Settings → API keys (console.anthropic.com/settings/keys).",
      "Cliquez « Create Key », puis copiez la clé (elle commence par sk-ant-).",
      "Collez-la ci-dessous.",
    ],
    note: "Nécessite des crédits dans la facturation de votre compte Anthropic.",
  },
  google: {
    steps: [
      "Ouvrez Google AI Studio (aistudio.google.com) et connectez-vous.",
      "Cliquez « Get API key » → « Create API key » (aistudio.google.com/app/apikey).",
      "Copiez la clé (elle commence par AIza).",
      "Collez-la ci-dessous.",
    ],
    note: "Un usage gratuit limité existe ; un projet Google Cloud est nécessaire pour aller au-delà.",
  },
  mistral: {
    steps: [
      "Connectez-vous sur console.mistral.ai.",
      "Ouvrez « API Keys » (console.mistral.ai/api-keys).",
      "Cliquez « Create new key », puis copiez-la.",
      "Collez-la ci-dessous.",
    ],
    note: "Activez la facturation pour les modèles payants ; une offre d'essai existe.",
  },
  deepseek: {
    steps: [
      "Créez un compte sur platform.deepseek.com.",
      "Ouvrez « API keys » (platform.deepseek.com/api_keys).",
      "Cliquez « Create new API key », puis copiez-la (elle commence par sk-).",
      "Collez-la ci-dessous.",
    ],
    note: "Hébergé en Chine : vos messages (déjà redacted) y transitent. Ajoutez des crédits au compte pour l'utiliser.",
  },
  openrouter: {
    steps: [
      "Créez un compte sur openrouter.ai.",
      "Ouvrez « Keys » (openrouter.ai/keys).",
      "Cliquez « Create Key », nommez-la, puis copiez-la (elle commence par sk-or-).",
      "Collez-la ci-dessous.",
    ],
    note: "Une clé, de nombreux modèles (dont des gratuits). Les payants demandent des crédits ; l'hébergement dépend du modèle.",
  },
  wrongPrefix: (provider, prefix) =>
    `Une clé ${provider} commence par ${prefix} — vérifiez que vous avez copié la bonne.`,
  tooShort: "Cette clé semble courte : copiez-la en entier.",
} satisfies Messages["providerKeys"];
