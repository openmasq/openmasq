import type { JsonObject, McpTool, McpToolCall, McpToolResult } from "../types";
import { resultText } from "../redact/walk";

/** Anthropic Messages API tool definition. */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: JsonObject;
}

/** A `tool_use` content block emitted by Claude. */
export interface AnthropicToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: JsonObject;
}

/** A `tool_result` content block fed back to Claude. */
export interface AnthropicToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** MCP tools -> Anthropic `tools` array. */
export function toAnthropicTools(tools: McpTool[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

/** A Claude `tool_use` block -> a neutral {@link McpToolCall}. */
export function parseAnthropicToolUse(block: AnthropicToolUse): McpToolCall {
  return { id: block.id, name: block.name, arguments: block.input ?? {} };
}

/** A (redacted) {@link McpToolResult} -> a Claude `tool_result` block. */
export function toAnthropicToolResult(
  callId: string,
  result: McpToolResult,
): AnthropicToolResult {
  return {
    type: "tool_result",
    tool_use_id: callId,
    content: resultText(result.content),
    is_error: result.isError,
  };
}
