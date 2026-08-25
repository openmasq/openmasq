/**
 * Known MCP "connector" servers (remote, OAuth — the Claude model). A preset with
 * a `url` connects in one click (login opens in the browser); a preset with an
 * empty `url` needs the user to paste their connector endpoint first.
 *
 * URLs are best-effort public endpoints and may change — the user can always edit
 * the URL or add a fully custom server. Verify before relying on them.
 *
 * ⚠️ The LIST is no longer hardcoded here — it is DERIVED from the single source of
 * truth `@openmasq/catalog` (the `remote`-transport connectors), so the desktop
 * Settings and the org admin console list the exact same servers. Add/edit a remote
 * connector in `packages/catalog/src/mcp/index.ts`, not here.
 */
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";

export interface McpPreset {
  id: string;
  name: string;
  desc: string;
  tone: string;
  /** Grouping category id (shared with the admin console via @openmasq/catalog). */
  category?: string;
  /** "apikey" = the endpoint needs an API key pasted into the URL (no one-click
   *  OAuth); undefined/"oauth" = one-click DCR login. */
  auth?: "oauth" | "apikey";
  /** Remote Streamable-HTTP endpoint. Empty = user must supply it. */
  url: string;
}

// EVERY preset here is a Streamable-HTTP MCP server whose OAuth authorization
// server supports **Dynamic Client Registration** (DCR) — verified live against
// each server's `.well-known/oauth-authorization-server` (a `registration_endpoint`
// is present). So the connector flow auto-registers a client in the browser and
// connects in ONE CLICK, with no pre-created OAuth app and no PAT. Servers WITHOUT
// DCR are intentionally excluded (they'd only hit the "use a local token" fallback).
// The `remote` connectors in `@openmasq/catalog` are exactly that DCR-verified set,
// preserving the original order; this maps them to the `McpPreset` shape.
export const MCP_PRESETS: McpPreset[] = MCP_CONNECTORS.filter(
  (c) => c.transport === "remote",
).map((c) => ({
  id: c.id,
  name: c.name,
  desc: c.desc,
  tone: c.tone ?? "",
  category: c.category,
  auth: c.auth,
  url: c.url ?? "",
}));

// Deliberately EXCLUDED — verified (via {host}/.well-known/oauth-authorization-server)
// to have NO `registration_endpoint`, so no one-click DCR:
//   • Slack — served metadata, registration_endpoint ABSENT.
//   • GitHub, Gmail, Google Drive — Google/GitHub OAuth, no AS metadata / no DCR;
//     GitHub & Slack also require a client_secret. They'd need a pre-registered
//     OAuth app (device flow / hosted token-exchange) — out until that exists.
//   • Figma — a LOCAL Dev-Mode HTTP server, no OAuth at all.
