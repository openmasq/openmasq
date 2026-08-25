import type { McpTool } from "../types";
import { toAnthropicTools, type AnthropicTool } from "./anthropic";
import { toOpenAITools, type OpenAITool } from "./openai";

export * from "./anthropic";
export * from "./openai";

/**
 * The two tool-schema dialects in use. Map a `@openmasq/llm` ProviderId here:
 * `anthropic`/`anthropic-session` -> "anthropic"; everything else (OpenAI,
 * Mistral, Google's OpenAI-compatible endpoint, local compat) -> "openai".
 */
export type ProviderFamily = "anthropic" | "openai";

/** Coarse provider id -> tool dialect. */
export function providerFamily(provider: string): ProviderFamily {
  return provider.startsWith("anthropic") ? "anthropic" : "openai";
}

/** Convert MCP tools to whichever dialect the chosen provider speaks. */
export function toProviderTools(
  family: ProviderFamily,
  tools: McpTool[],
): AnthropicTool[] | OpenAITool[] {
  return family === "anthropic" ? toAnthropicTools(tools) : toOpenAITools(tools);
}
