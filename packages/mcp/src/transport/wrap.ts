import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  JsonObject,
  McpContent,
  McpTool,
  McpToolCall,
  McpToolResult,
} from "../types";

export const CLIENT_INFO = { name: "openmasq", version: "0.1.0" };

/** List tools from a connected SDK client, tagged with the connection id. */
export async function listToolsVia(client: Client, id: string): Promise<McpTool[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema ?? {}) as unknown as JsonObject,
    serverId: id,
    // Carry the server's behaviour hints so the write-confirmation gate can trust
    // the server (readOnlyHint/destructiveHint) instead of a name heuristic.
    ...(t.annotations ? { annotations: t.annotations as McpTool["annotations"] } : {}),
  }));
}

/** Run one tool via a connected SDK client and normalise the result. */
export async function callToolVia(
  client: Client,
  call: McpToolCall,
): Promise<McpToolResult> {
  const res = await client.callTool({ name: call.name, arguments: call.arguments });
  return {
    content: (res.content ?? []) as unknown as McpContent[],
    isError: res.isError === true,
  };
}
