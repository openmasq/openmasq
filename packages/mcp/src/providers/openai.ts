import type { JsonObject, McpTool, McpToolCall, McpToolResult } from "../types";
import { resultText } from "../redact/walk";

/**
 * OpenAI / Mistral tool definition. Both use the same Chat Completions schema,
 * so this adapter serves the `openai`, `mistral`, and `openai-compat` providers.
 */
export interface OpenAITool {
  type: "function";
  function: { name: string; description?: string; parameters: JsonObject };
}

/** A `tool_calls[]` entry emitted by OpenAI/Mistral (arguments are a JSON string). */
export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** A `role: "tool"` message fed back to OpenAI/Mistral. */
export interface OpenAIToolMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

/** MCP tools -> OpenAI/Mistral `tools` array. */
export function toOpenAITools(tools: McpTool[]): OpenAITool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * An OpenAI/Mistral tool call -> a neutral {@link McpToolCall}. The model serialises
 * arguments as a JSON string; a malformed string yields empty arguments rather
 * than throwing, so one bad call can't abort the whole turn.
 */
export function parseOpenAIToolCall(tc: OpenAIToolCall): McpToolCall {
  let args: JsonObject = {};
  try {
    const parsed = JSON.parse(tc.function.arguments || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
  } catch {
    args = {};
  }
  return { id: tc.id, name: tc.function.name, arguments: args };
}

/** A (redacted) {@link McpToolResult} -> an OpenAI/Mistral tool message. */
export function toOpenAIToolMessage(
  callId: string,
  result: McpToolResult,
): OpenAIToolMessage {
  return { role: "tool", tool_call_id: callId, content: resultText(result.content) };
}
