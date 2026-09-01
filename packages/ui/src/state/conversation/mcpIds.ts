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

/** The connector that grants folders on this machine. */
export const FILESYSTEM_CONNECTOR_ID = "filesystem";
