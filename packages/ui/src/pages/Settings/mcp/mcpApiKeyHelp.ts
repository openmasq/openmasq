/**
 * Per-connector API-KEY help + how the key is applied — the data behind the
 * "Clé API" tutorial shown in `McpConnectorModal` for API-key connectors.
 *
 * Two application styles exist:
 *  - `keyIn: "query"` — the hosted endpoint takes the key as a URL query param
 *    (Exa `?exaApiKey=…`, Tavily `?tavilyApiKey=…`); the key is composed INTO the
 *    connect URL client-side (`composeApiKeyUrl`) and connects anonymously.
 *  - `keyIn: "header"` — the endpoint wants `Authorization: Bearer <key>`
 *    (Fireflies); the desktop stores the key ENCRYPTED and sends it as a header.
 */
export interface ApiKeyHelp {
  /** How the key is applied: appended to the URL as a query param, or a Bearer header. */
  keyIn: "query" | "header";
  /** Query-param name when `keyIn === "query"`. */
  param?: string;
  /** Where the user gets the key. */
  keyUrl: string;
  /** Input label / placeholder. */
  keyLabel: string;
  /** Ordered FR tutorial steps. */
  steps: string[];
}

export const MCP_API_KEY_HELP: Record<string, ApiKeyHelp> = {
  exa: {
    keyIn: "query",
    param: "exaApiKey",
    keyUrl: "https://dashboard.exa.ai/api-keys",
    keyLabel: "Clé Exa",
    steps: [
      "Créez un compte sur exa.ai.",
      "Ouvrez le tableau de bord → API Keys (dashboard.exa.ai/api-keys).",
      "Créez puis copiez une clé.",
      "Collez-la ci-dessous.",
    ],
  },
  tavily: {
    keyIn: "query",
    param: "tavilyApiKey",
    keyUrl: "https://app.tavily.com/home",
    keyLabel: "Clé Tavily (tvly-…)",
    steps: [
      "Créez un compte gratuit sur tavily.com.",
      "Dans le tableau de bord (app.tavily.com), ouvrez API Keys.",
      "Copiez votre clé (elle commence par tvly-).",
      "Collez-la ci-dessous.",
    ],
  },
  fireflies: {
    keyIn: "header",
    keyUrl: "https://fireflies.ai/dashboard/settings/api",
    keyLabel: "Clé Fireflies",
    steps: [
      "Connectez-vous sur fireflies.ai.",
      "Ouvrez Paramètres → Developer Settings (fireflies.ai/dashboard/settings/api).",
      "Copiez votre clé (générez-la si nécessaire).",
      "Collez-la ci-dessous — elle est chiffrée sur votre machine, jamais envoyée au modèle.",
    ],
  },
};

/** The API-key help for a connector id, or undefined if none is documented. */
export function apiKeyHelp(id: string): ApiKeyHelp | undefined {
  return MCP_API_KEY_HELP[id];
}

/**
 * Compose the connect URL for a query-param key (append `?param=key`, URL-encoded,
 * preserving any existing query string). Returns the base URL unchanged for a
 * header key (the key travels as a Bearer header, not in the URL).
 */
export function composeApiKeyUrl(baseUrl: string, help: ApiKeyHelp, key: string): string {
  if (help.keyIn !== "query" || !help.param) return baseUrl;
  const u = new URL(baseUrl);
  u.searchParams.set(help.param, key.trim());
  return u.toString();
}
