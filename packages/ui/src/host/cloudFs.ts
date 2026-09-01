/**
 * OPTIONAL browsing of a connected storage — the remote counterpart of {@link LocalFsHost}
 * for files that aren't on this machine (Google Drive, OneDrive, Dropbox).
 *
 * WHY NOT `mcp.callTool`. The same reason as for local folders: a connector's
 * tools render prose made for a model (`name — type (date) · id:…`),
 * every call goes through the conversation's vault — but this panel must show the
 * user THEIR real files (rule 11 governs what the model sees, nothing
 * else). Same account, same token, same firewall; a shape made for an interface.
 *
 * ABSENT ⇒ DEGRADE. No slot (web preview, mobile) or no source ⇒ the group isn't
 * drawn. It's a convenience, not a guarantee the user has chosen.
 *
 * READ ONLY, AND LISTING ONLY. No content byte transits through here: reading a
 * remote document remains the model's and its tools' business. The OAuth token never
 * leaves the main process, and the folder id the renderer passes is validated
 * there before entering a provider URL.
 */
export interface CloudEntry {
  /** The provider's identifier, opaque to the interface: a Drive fileId, a Graph
   *  itemId, a Dropbox path. It gets passed back as-is, never composed. */
  id: string;
  name: string;
  kind: "dir" | "file";
  /** Epoch ms; 0 when the provider didn't give it. */
  mtime: number;
}

/** A connected, browsable storage account. */
export interface CloudSource {
  /** The INSTANCE id (multi-account: `google-drive--2`) — pass back as-is. */
  id: string;
  /** The catalog id: what decides the displayed logo and name. */
  connectorId: string;
  /** The account, when the connector could name it. */
  label?: string;
}

export interface CloudFsHost {
  /** The connected storages the app can browse. Empty = nothing to show. */
  sources(): Promise<{ sources: CloudSource[] }>;
  /** The contents of a folder; `folderId` of `null` = the account's root. */
  list(sourceId: string, folderId: string | null): Promise<{ entries: CloudEntry[] }>;
}
