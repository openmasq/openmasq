/**
 * @openmasq/connectors — transport-agnostic MCP connector tool definitions, run
 * IN-PROCESS by the desktop (desktop-direct, no broker). See `types.ts`.
 */
export type {
  Connector,
  ConnectorAuth,
  ConnectorTool,
  ConnectorToolCtx,
  ConnectorToolResult,
  ConnectorTextContent,
  ConnectorScopes,
} from "./types";
export { githubConnector } from "./github";
export { googleCalendarConnector } from "./google/calendar";
export { sendEmail } from "./google/gmailSend";
export { gmailConnector } from "./google/gmailRead";
export { googleDriveConnector, driveChildrenUrl, parseDriveChildren } from "./google/drive";
export { onedriveChildrenUrl, parseOnedriveChildren } from "./microsoft/onedrive";
export { googleDocsConnector } from "./google/docs";
export { googleSheetsConnector } from "./google/sheets";
export { googleTasksConnector } from "./google/tasks";
export { googleAnalyticsConnector } from "./google/analytics";
export { slackConnector } from "./slack";
export {
  microsoftOutlookConnector,
  microsoftOneDriveConnector,
  microsoftSharePointConnector,
  microsoftTeamsConnector,
} from "./microsoft";

import type { Connector } from "./types";
import { githubConnector } from "./github";
import { googleCalendarConnector } from "./google/calendar";
import { gmailConnector } from "./google/gmailRead";
import { googleDriveConnector } from "./google/drive";
import { googleDocsConnector } from "./google/docs";
import { googleSheetsConnector } from "./google/sheets";
import { googleTasksConnector } from "./google/tasks";
import { googleAnalyticsConnector } from "./google/analytics";
import { slackConnector } from "./slack";
import {
  microsoftOutlookConnector,
  microsoftOneDriveConnector,
  microsoftSharePointConnector,
  microsoftTeamsConnector,
} from "./microsoft";

/** Every desktop-direct connector, by id. */
export const CONNECTORS: Connector[] = [
  githubConnector,
  googleCalendarConnector,
  gmailConnector,
  googleDriveConnector,
  googleDocsConnector,
  googleSheetsConnector,
  googleTasksConnector,
  googleAnalyticsConnector,
  slackConnector,
  microsoftOutlookConnector,
  microsoftOneDriveConnector,
  microsoftSharePointConnector,
  microsoftTeamsConnector,
];

/** Look up a connector by id (as used in the catalog / persisted server spec). */
export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export * from "./files";
