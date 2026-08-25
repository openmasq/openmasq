import { PROVIDERS, type ProviderId } from "@openmasq/llm";

/**
 * Per-PROVIDER "where to find your API key" help — the data behind the detailed
 * tutorial shown in `ApiKeyModal` and the onboarding's key step
 * (`pages/Onboarding/KeySteps.tsx`), mirroring the MCP connector key flow
 * (`Settings/mcpApiKeyHelp.ts`). Ordered FR steps + the official key page + the key's
 * prefix (placeholder) + a one-line note on cost/hosting. Keyed by `ProviderId`; a
 * provider with no entry falls back to the minimal form + the registry `keyUrl` link.
 */
export interface ProviderKeyHelp {
  /** The provider's OFFICIAL key page. */
  keyUrl: string;
  /** Input placeholder = the key's recognisable prefix. */
  placeholder: string;
  /** The prefix a key of this provider PROVABLY starts with, when it has one — the
   *  paste-time verdict's only hard fact. Absent = the provider mints keys with no
   *  fixed shape, and no shape claim may be made about them. */
  prefix?: string;
  /** Ordered FR tutorial steps. */
  steps: string[];
  /** One-line note (cost / billing / hosting) shown under the steps. */
  note?: string;
}

export const PROVIDER_KEY_HELP: Partial<Record<ProviderId, ProviderKeyHelp>> = {
  openai: {
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-…",
    prefix: "sk-",
    steps: [
      "Connectez-vous sur platform.openai.com.",
      "Ouvrez « API keys » (menu profil), ou allez sur platform.openai.com/api-keys.",
      "Cliquez « Create new secret key », nommez-la, puis copiez-la (elle commence par sk-).",
      "Collez-la ci-dessous. Elle n'est affichée qu'une fois — recréez-en une si vous la perdez.",
    ],
    note: "Nécessite un moyen de paiement et des crédits dans la facturation de votre compte OpenAI.",
  },
  anthropic: {
    keyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
    prefix: "sk-ant-",
    steps: [
      "Connectez-vous sur console.anthropic.com.",
      "Ouvrez Settings → API keys (console.anthropic.com/settings/keys).",
      "Cliquez « Create Key », puis copiez la clé (elle commence par sk-ant-).",
      "Collez-la ci-dessous.",
    ],
    note: "Nécessite des crédits dans la facturation de votre compte Anthropic.",
  },
  google: {
    keyUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIza…",
    prefix: "AIza",
    steps: [
      "Ouvrez Google AI Studio (aistudio.google.com) et connectez-vous.",
      "Cliquez « Get API key » → « Create API key » (aistudio.google.com/app/apikey).",
      "Copiez la clé (elle commence par AIza).",
      "Collez-la ci-dessous.",
    ],
    note: "Un usage gratuit limité existe ; un projet Google Cloud est nécessaire pour aller au-delà.",
  },
  mistral: {
    keyUrl: "https://console.mistral.ai/api-keys",
    placeholder: "Votre clé Mistral",
    steps: [
      "Connectez-vous sur console.mistral.ai.",
      "Ouvrez « API Keys » (console.mistral.ai/api-keys).",
      "Cliquez « Create new key », puis copiez-la.",
      "Collez-la ci-dessous.",
    ],
    note: "Activez la facturation pour les modèles payants ; une offre d'essai existe.",
  },
  deepseek: {
    keyUrl: "https://platform.deepseek.com/api_keys",
    placeholder: "sk-…",
    prefix: "sk-",
    steps: [
      "Créez un compte sur platform.deepseek.com.",
      "Ouvrez « API keys » (platform.deepseek.com/api_keys).",
      "Cliquez « Create new API key », puis copiez-la (elle commence par sk-).",
      "Collez-la ci-dessous.",
    ],
    note: "Hébergé en Chine : vos messages (déjà redacted) y transitent. Ajoutez des crédits au compte pour l'utiliser.",
  },
  openrouter: {
    keyUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-…",
    prefix: "sk-or-",
    steps: [
      "Créez un compte sur openrouter.ai.",
      "Ouvrez « Keys » (openrouter.ai/keys).",
      "Cliquez « Create Key », nommez-la, puis copiez-la (elle commence par sk-or-).",
      "Collez-la ci-dessous.",
    ],
    note: "Une clé, de nombreux modèles (dont des gratuits). Les payants demandent des crédits ; l'hébergement dépend du modèle.",
  },
};

/** The key help for a provider id, or undefined if none is documented. */
export function providerKeyHelp(provider: string): ProviderKeyHelp | undefined {
  return PROVIDER_KEY_HELP[provider as ProviderId];
}

/** A paste-time verdict on a pasted key. `error` = a shape the value provably cannot
 *  have; `warn` = merely suspicious. */
export interface ProviderKeyIssue {
  level: "error" | "warn";
  message: string;
}

/** Below this a key is almost certainly a truncated copy — every provider above mints
 *  far longer ones. A threshold, not a proof, hence `warn`. */
const SHORT_KEY = 20;

/**
 * What is visibly wrong with a key AS IT IS PASTED — the same service the MCP flow's
 * `byoValidate.ts` renders for a client id, on the one shape an LLM key has.
 *
 * ⚠️ It NEVER blocks the save, on purpose. The prefix is documentation, not a contract:
 * the day a provider mints a new shape, a blocking check would turn this screen into a
 * dead end for a key that actually works — while the wrong key merely fails, loudly and
 * with the provider's own words, at the first send. So this explains and lets the person
 * decide. (`ApiKeyModal` shows the same messages.)
 */
export function providerKeyIssue(provider: string, value: string): ProviderKeyIssue | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const help = providerKeyHelp(provider);
  const label = PROVIDERS[provider as ProviderId]?.label ?? provider;
  if (help?.prefix && !v.startsWith(help.prefix)) {
    return {
      level: "error",
      message: `Une clé ${label} commence par ${help.prefix} — vérifiez que vous avez copié la bonne.`,
    };
  }
  if (v.length < SHORT_KEY) {
    return { level: "warn", message: "Cette clé semble courte : copiez-la en entier." };
  }
  return undefined;
}
