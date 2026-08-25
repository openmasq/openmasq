/**
 * Concrete {@link McpConnection}s backed by the official MCP SDK. Kept in its own
 * entry (`@openmasq/mcp/transport`) so the pure core never pulls the SDK in.
 *
 * - `connectStdio` — spawn a local server process (filesystem, …) over stdio.
 * - `HttpMcpServer` / `connectHttp` — remote "connector" servers over Streamable
 *   HTTP, with the OAuth login handshake (Notion / Slack / Gmail / …).
 * - `makeOAuthProvider` — storage-backed OAuth client for the connector flow.
 */

export { connectStdio, type StdioServerSpec } from "./stdio";
export {
  wrapExecMeta,
  findExecMetaTool,
  parseExecToolNames,
  parseExecToolInfo,
  execCallCommand,
  EXEC_META_TOOL,
  type ExecMetaOptions,
} from "./execMeta";
export {
  HttpMcpServer,
  connectHttp,
  type HttpServerSpec,
  type ConnectOutcome,
} from "./http";
export {
  makeOAuthProvider,
  type StoredOAuthState,
  type OAuthProviderOptions,
} from "./oauth";
export { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
export type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
