/**
 * Transport-agnostic connector tool definitions. A "connector" is a set of tools
 * that call a provider's REST API with an access token — the SAME idea the broker
 * platforms used (`apps/mcp-broker/src/platforms/*`), but pure and provider-neutral so the
 * desktop can run them IN-PROCESS (desktop-direct, no broker/server). The desktop
 * adapter (`apps/desktop/.../mcp/connectors/run.ts`) wraps each tool as an
 * `McpConnection`, so tool output still flows through the renderer's redaction.
 *
 * Pure: no Node/Electron/SDK — only `fetch`/`RequestInit` (DOM lib). Never store or
 * log secrets here; the access token is injected per call by the caller.
 */

/** Helpers handed to a tool — already authenticated with the provider. */
export interface ConnectorToolCtx {
  /** The provider access token (GitHub/Google/…). Never logged, never returned. */
  accessToken: string;
  /** Authenticated JSON fetch; throws a normalised error (never echoes the body). */
  fetchJson: <T>(url: string, init?: RequestInit) => Promise<T>;
  /** Authenticated fetch returning the RAW response text — for endpoints that
   *  don't return JSON (e.g. Drive `export`/`alt=media` file contents). */
  fetchText: (url: string, init?: RequestInit) => Promise<string>;
}

/** One text part of a tool result (only text parts are ever redacted downstream). */
export interface ConnectorTextContent {
  type: "text";
  text: string;
}

/** A tool result, structurally compatible with `@openmasq/mcp` `McpToolResult`. */
export interface ConnectorToolResult {
  content: ConnectorTextContent[];
  isError?: boolean;
}

/** One tool a connector exposes. `inputSchema` is JSON Schema for the arguments. */
export interface ConnectorTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** OAuth scope this tool requires. When set, the tool is only LISTED if that
   *  scope was granted for the active connection (e.g. Gmail's read tools appear
   *  only when connected with the read scope) — see the desktop `run.ts` filter.
   *  Tools with no `scope` are always listed. */
  scope?: string;
  run(args: Record<string, unknown>, ctx: ConnectorToolCtx): Promise<ConnectorToolResult>;
}

/** OAuth scopes to request, per credential mode. `managed` = the app's own (public)
 *  client, kept to CASA-free scopes; `byo` = the user's own client (may be wider). */
export interface ConnectorScopes {
  managed: string[];
  byo: string[];
}

/** How the desktop authenticates a connector (desktop-direct, no broker):
 *  - "device" — OAuth device flow (no secret, no redirect): GitHub.
 *  - "pkce"   — OAuth authorization-code + loopback redirect + PKCE: Google.
 *  - "slack"  — Slack (no PKCE, HTTPS-only redirect) via the gateway auth-only fn:
 *    the token is fetched by the desktop, the Slack DATA never transits the server.
 *  - "microsoft" — Microsoft identity platform: authorization-code + loopback + PKCE
 *    with a PUBLIC client (no secret), `offline_access` for a refresh_token. */
export type ConnectorAuth = "device" | "pkce" | "slack" | "microsoft";

/** A connector: an id, a display name, its auth style, scopes, and its tools. */
export interface Connector {
  id: string;
  name: string;
  /** Which desktop-direct OAuth flow this connector uses. */
  auth: ConnectorAuth;
  scopes: ConnectorScopes;
  tools: ConnectorTool[];
  /**
   * Turn a provider failure into an ACTIONABLE message for the user, in French.
   *
   * It lives on the CONNECTOR, not in each tool, because the adapter applies it to
   * every call (`run.ts`) — so a tool added later cannot forget it. That is the whole
   * point: `googleApiErrorHint` existed and said exactly the right thing ("« API
   * Google Calendar » n'est pas activée", "jeton expiré — reconnectez"), but only
   * Gmail's tools called it by hand. Every other Google connector surfaced the bare
   * `Upstream request failed (401)`, which tells the user nothing they can act on and
   * leaves the model to invent a cause.
   *
   * Absent ⇒ the raw normalised message, as before.
   */
  errorHint?: (err: unknown) => string;
  /** When true the `managed` mode is unavailable — the connector needs a RESTRICTED
   *  scope (e.g. Gmail read) whose app client would require Google's CASA audit,
   *  so it's usable ONLY with the user's own keys (their test-mode app avoids CASA). */
  byoOnly?: boolean;
}
