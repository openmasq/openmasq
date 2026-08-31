import {
  driveChildrenUrl,
  onedriveChildrenUrl,
  parseDriveChildren,
  parseOnedriveChildren,
  type RemoteEntry,
} from "@openmasq/connectors";

/**
 * The storages the app knows how to BROWSE — a switchboard, not an implementation.
 *
 * Building the URL and parsing the response lives in `@openmasq/connectors`, along with the
 * `list_folder` tool that the model calls: the panel and the model list the same account, so
 * there is only one piece of code to say how. The id validation is over there too
 * (`assertFileId`) — both callers go through it.
 *
 * ⚠️ ALLOW-list: a connector absent from BOTH lists is not browsable, whatever it
 * otherwise exposes.
 */
export type CloudEntry = RemoteEntry;

export interface CloudProvider {
  childrenUrl(folderId: string | null): string;
  parse(body: unknown): CloudEntry[];
}

export const CLOUD_PROVIDERS: Record<string, CloudProvider> = {
  "google-drive": { childrenUrl: driveChildrenUrl, parse: parseDriveChildren },
  "microsoft-onedrive": { childrenUrl: onedriveChildrenUrl, parse: parseOnedriveChildren },
};

/**
 * The storages that have NO direct call on our side and are browsed via the listing
 * tool of their own MCP server (`mcpBrowse.ts`).
 *
 * ⚠️ Being listed here is not enough: the server must REALLY expose an allow-listed
 * listing and return classifiable JSON from it. Otherwise the source keeps its status
 * row — a chevron that leads nowhere would be worse than no chevron.
 */
export const MCP_BROWSABLE = new Set(["dropbox"]);
