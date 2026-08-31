import { listServers } from "../mcp/persist";
import { connected, routes } from "../mcp/server/registry";
import { directFetchJson } from "../mcp/connectors";
import { isFolderListTool, mcpBrowseList } from "./mcpBrowse";
import { CLOUD_PROVIDERS, MCP_BROWSABLE, type CloudEntry } from "./providers";

/**
 * Browse a connected storage (Google Drive, OneDrive, Dropbox) from the UI.
 *
 * Why this isn't `mcp.callTool` — the same reason as for local folders
 * (`ipc/registerLocalFsIpc.ts`): a connector's tools render PROSE for a
 * model (`name — type (date) · id:…`), and the panel needs a typed list. Same
 * account, same token, same firewall — a shape made for a UI.
 *
 * SECURITY — what this widens, and what it does not:
 *  - **Reading is PARITY.** The renderer can already call
 *    `mcp.callTool("google-drive__search_files")` and get the real names back. This adds
 *    a shape, not a scope: no write, no byte of content, no extra
 *    scope — the same ones the user already granted to the OAuth.
 *  - **The targeted connector is ALLOW-LISTED** (`CLOUD_PROVIDERS` for a direct call,
 *    `MCP_BROWSABLE` for a remote server) and must be CONNECTED. A connector that
 *    isn't a storage isn't reachable from here, even if the renderer sends its id.
 *  - **Two regimes, one output.** Drive and OneDrive: we build the URL. Dropbox:
 *    we call ITS listing tool, whose name is also allow-listed and whose
 *    response is read fail-closed (`mcpBrowse.ts`). In both cases, listing and nothing else.
 *  - **The folder id is validated before entering a URL** (`assertCloudId`): it's
 *    the only value the renderer chooses.
 *  - **The token never leaves main.** `directFetchJson` resolves it (and refreshes it),
 *    applies the SSRF floor and refuses to follow an authenticated redirect.
 *  - **Connector absent ⇒ capability absent**: the source isn't listed, rather than an
 *    invented root.
 */

export interface CloudSource {
  /** The server's INSTANCE id (multi-account: `google-drive--2`). */
  id: string;
  /** The catalog id — what decides the provider and the logo. */
  connectorId: string;
  /** The account, when the connector could name it. */
  label?: string;
}

const connectorIdOf = (specId: string, stored?: string): string => {
  if (stored) return stored;
  const i = specId.indexOf("--");
  return i > 0 ? specId.slice(0, i) : specId;
};

/** Does a remote server expose a folder listing? Read from the ROUTING table, which
 *  main already keeps up to date — announcing as browsable an account that isn't would give a
 *  chevron that leads nowhere. */
function exposesLister(serverId: string): boolean {
  const prefix = `${serverId}__`;
  for (const name of routes.keys()) if (name.startsWith(prefix) && isFolderListTool(name)) return true;
  return false;
}

/** The connected storages we know how to browse. */
export function cloudSources(): CloudSource[] {
  return listServers()
    .map((s) => ({ id: s.id, connectorId: connectorIdOf(s.id, s.connectorId), label: s.label }))
    .filter(
      (s) =>
        connected.has(s.id) &&
        (!!CLOUD_PROVIDERS[s.connectorId] ||
          (MCP_BROWSABLE.has(s.connectorId) && exposesLister(s.id))),
    );
}

/** A folder's content (the account root if `folderId` is absent). */
export async function cloudList(
  instanceId: string,
  folderId: string | null,
): Promise<{ entries: CloudEntry[] }> {
  // Start from the source list: it already carries both checks (it's a
  // known storage, it's connected). An id not in it reaches no URL.
  const source = cloudSources().find((s) => s.id === instanceId);
  if (!source) throw new Error("Ce stockage n'est pas connecté.");
  const provider = CLOUD_PROVIDERS[source.connectorId];
  if (!provider) {
    // Remote server: its own listing tool. `connected` already served as a guard
    // above, so the connection exists.
    const conn = connected.get(source.id)!;
    return { entries: await mcpBrowseList(conn, folderId) };
  }
  const body = await directFetchJson<unknown>(source.id, provider.childrenUrl(folderId));
  return { entries: provider.parse(body) };
}
