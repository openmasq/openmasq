import type { McpConnector } from "../types";

/**
 * Connectors SHIPPED WITH the app — no account, no endpoint, nothing to paste: the
 * user just turns them on. Catalogued (rather than hardcoded in the UI) so the three
 * surfaces that name them agree by construction: the Settings grid (`mcpItems.ts`),
 * the chat "connect this integration" suggestion cards (`suggestIntegrations.ts`, via
 * `findConnector`), and the org MCP policy (the backend validates `server_id` against
 * the catalog ids, so an org can now block the browser like any other connector).
 *
 * ⚠️ Their enable path is HOST-side (`host.mcp.enableBrowser`), not a transport this
 * package knows about — a surface running where the capability is absent (the web
 * preview, mobile) MUST filter them out rather than offer a dead card.
 */

/** The single controllable-browser connector (not multi-account, one instance). */
export const BROWSER_CONNECTOR_ID = "browser";

export const BUILTIN: McpConnector[] = [
  {
    id: BROWSER_CONNECTOR_ID,
    name: "Navigateur",
    desc: "Laisser le modèle agir dans un navigateur (remplir des formulaires, cliquer) sur vos sites connectés.",
    category: "automation",
    tone: "mint",
    transport: "builtin",
  },
];
