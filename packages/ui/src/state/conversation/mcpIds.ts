import { connectorIdFromInstance } from "@openmasq/catalog/mcp";

/**
 * The INSTANCE id of a local MCP server, derived from its catalogue entry.
 *
 * A convention, not a piece of data: main registers a stdio server under `local-<catalogId>`
 * (`mcp/server/lifecycle.ts`), and anything that targets this server — the Réglages card as
 * well as the right sidebar's « Dossiers » view — must target the SAME id. Copying it by guesswork
 * means targeting a server that doesn't exist: the call goes out, the host replies « inconnu »,
 * and the button looks like it's doing nothing.
 */
export const localServerId = (catalogId: string): string => `local-${catalogId}`;

/**
 * The reverse: the CATALOGUE id a server instance belongs to. What a per-connector setting
 * is keyed by (`Settings.connectorMasking`, set from the connector's card), while a tool
 * name carries the INSTANCE — `local-filesystem__read_file`, `notion--a1b2c3__search` for a
 * second account. Looking the setting up by instance silently finds nothing and falls back
 * to the global rules (`send/connectorMasking.test.ts`).
 */
export const connectorOfServer = (serverId: string): string =>
  connectorIdFromInstance(serverId.startsWith("local-") ? serverId.slice("local-".length) : serverId);

/** The connector that grants folders on this machine. */
export const FILESYSTEM_CONNECTOR_ID = "filesystem";
