/**
 * @openmasq/mcp — a **redacting MCP client** that any model (Anthropic / GPT /
 * Mistral) can use to reach MCP servers (Gmail, …) without ever seeing real data.
 *
 *   model ──tool_call(args with placeholders)──▶ RedactingMcpClient
 *     1. unredact(args)  placeholder ──▶ real value
 *     2. callTool       ──▶ REAL MCP server (Gmail)  ──▶ real result
 *     3. redact(result) real value ──▶ placeholder   (shared vault grows)
 *   model ◀──tool_result(placeholders only)──────────┘
 *
 * This barrel is the **pure core** (zero SDK): the redacting client, the JSON
 * walk, the provider tool-schema adapters, and the shared types. The concrete
 * stdio / HTTP transport lives behind the separate `./transport` entry so the
 * core stays unit-testable with an in-memory {@link McpConnection} fake.
 *
 * @example
 * ```ts
 * import { RedactingMcpClient, providerFamily, toProviderTools,
 *          parseAnthropicToolUse } from "@openmasq/mcp";
 * import { connectStdio } from "@openmasq/mcp/transport";
 *
 * const gmail = await connectStdio({ id: "gmail", command: "npx", args: ["gmail-mcp"] });
 * const mcp = new RedactingMcpClient({ connections: [gmail], vault: conv.vault });
 *
 * // hand the tools to Claude — schemas only, no data
 * const tools = toProviderTools("anthropic", await mcp.listTools());
 *
 * // when Claude emits a tool_use block:
 * const result = await mcp.callTool(parseAnthropicToolUse(block));
 * ```
 */

export type {
  JsonValue,
  JsonObject,
  McpTool,
  McpToolCall,
  McpContent,
  McpToolResult,
  McpConnection,
  RedactString,
  Vault,
} from "./types";

export { RedactingMcpClient, type RedactingMcpOptions } from "./redact/client";
export { mapStrings, mapContentText, resultText } from "./redact/walk";
export { isDeadTransport, DEAD_TRANSPORT_MESSAGES } from "./deadTransport";
export * from "./providers";
