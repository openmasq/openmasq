import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Helpers handed to a platform's tools (already authenticated with the upstream). */
export interface ToolCtx {
  /** The upstream provider access token (Google/Slack/GitHub). Never returned to the client. */
  accessToken: string;
  /** Authenticated JSON fetch against the provider; throws a normalised error. */
  fetchJson: <T>(url: string, init?: RequestInit) => Promise<T>;
}

/** Normalised tokens the broker keeps for a connected upstream account. */
export interface UpstreamTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

/** Upstream OAuth endpoints for a real provider (credentials from env). */
export interface OAuthUpstream {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId?: string;
  clientSecret?: string;
  /** Extra static params on the authorize redirect (e.g. Google's access_type/prompt). */
  authorizeParams?: Record<string, string>;
  /** Map the provider's token response to a token set (default reads access_token).
   *  Slack nests the user token under `authed_user`, so it overrides this. */
  parseToken?: (raw: Record<string, unknown>) => UpstreamTokenSet;
}

export interface Platform {
  id: string;
  name: string;
  desc: string;
  /** Demo only: no real upstream — /authorize auto-consents and tokens are synthetic. */
  fake?: boolean;
  upstream?: OAuthUpstream;
  /** Register this platform's MCP tools onto a per-request server. */
  registerTools(server: McpServer, ctx: ToolCtx): void;
}

/**
 * A platform is usable if it's the demo or its upstream **client id** is set. The
 * client secret is optional: an id with no secret is a *public* client (the broker
 * adds PKCE on the upstream leg). See `config.ts` for the shared-keys posture.
 */
export function isAvailable(p: Platform): boolean {
  return !!p.fake || !!p.upstream?.clientId;
}
