/**
 * Live MCP server management — split by concern behind this barrel (rule 2/10; the
 * public surface is unchanged, `../mcp` resolves here):
 *   registry.ts     — the ONE home for the live connection/route state + notifiers
 *   info.ts         — read views over that state (`infoFor`/`mcpList`/`mcpCatalog`)
 *   accounts.ts     — identity / dedupe / credential-group resolution
 *   lifecycle.ts    — add/remove + the native path-grant gate (audit M-4)
 *   callTool.ts     — the tool-dispatch security path (write gate M6, browser allow-list C1)
 *   connect.ts      — connect dispatch (stdio/direct/browser) + reconnect + setMcpUser
 *   connectRemote.ts — the remote http + OAuth-loopback connect flow
 *   accountFlows.ts — the multi-account connect/reauth flows
 */
export type { McpServerInfo, McpAuthChoice } from "./types";

export {
  setMcpChangeNotifier,
  setMcpNeedsReconnectNotifier,
  setMcpOauthUrlNotifier,
  setMcpAuthChoiceAsker,
  mcpDisconnect,
  mcpCloseAll,
  mcpListToolsAll,
} from "./registry";
export { mcpCatalog, mcpList } from "./info";
export { mcpByoCredGroups } from "./accounts";
export { mcpAdd, mcpAddCustom, mcpAddStdio, mcpRemove, mcpSetStdioDirs, notePickedDir } from "./lifecycle";
export { isCustomServerId } from "./customSpec";
export { mcpCallTool } from "./callTool";
export {
  mcpConnect,
  mcpEnableBrowser,
  mcpDisableBrowser,
  setMcpUser,
} from "./connect";
export {
  mcpConnectDirect,
  mcpAddAccountDirect,
  mcpAddAccountRemote,
  mcpReauthDirect,
} from "./accountFlows";
export { cancelConnect as mcpCancelConnect } from "./connectCancel";
