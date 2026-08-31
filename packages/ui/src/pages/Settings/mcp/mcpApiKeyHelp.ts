import type { Messages } from "@openmasq/i18n";
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
  steps: readonly string[];
}

/** The FACTS about each connector's key — where it's configured, and where it's obtained. */
const API_KEY_SHAPE: Record<string, Omit<ApiKeyHelp, "keyLabel" | "steps">> = {
  exa: { keyIn: "query", param: "exaApiKey", keyUrl: "https://dashboard.exa.ai/api-keys" },
  tavily: { keyIn: "query", param: "tavilyApiKey", keyUrl: "https://app.tavily.com/home" },
  fireflies: { keyIn: "header", keyUrl: "https://fireflies.ai/dashboard/settings/api" },
};

/** The API-key help for a connector id, or undefined if none is documented. */
/** The complete record — facts + copy in `t`'s language. */
export function apiKeyHelp(id: string, t: Messages): ApiKeyHelp | undefined {
  const shape = API_KEY_SHAPE[id];
  const copy = (
    t.mcpTab.apiKeys as Record<string, { label: string; steps: readonly string[] } | undefined>
  )[id];
  return shape && copy ? { ...shape, keyLabel: copy.label, steps: copy.steps } : undefined;
}

/**
 * Compose the connect URL for a query-param key (append `?param=key`, URL-encoded,
 * preserving any existing query string). Returns the base URL unchanged for a
 * header key (the key travels as a Bearer header, not in the URL).
 */
export function composeApiKeyUrl(
  baseUrl: string,
  help: Pick<ApiKeyHelp, "keyIn" | "param">,
  key: string,
): string {
  if (help.keyIn !== "query" || !help.param) return baseUrl;
  const u = new URL(baseUrl);
  u.searchParams.set(help.param, key.trim());
  return u.toString();
}

/**
 * What the host needs to receive to connect a key-based service: the URL carrying the key
 * as a param, or the bare key (header). The SHAPE is enough — no copy, hence no
 * language: the connector says where its key goes, `useMcpConnectors` no longer needs to know.
 */
export function apiKeyConnectOpts(
  id: string,
  baseUrl: string,
  key: string,
): { url: string } | { apiKey: string } {
  const shape = API_KEY_SHAPE[id];
  return shape?.keyIn === "query" ? { url: composeApiKeyUrl(baseUrl, shape, key) } : { apiKey: key };
}
