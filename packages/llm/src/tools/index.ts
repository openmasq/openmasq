import { PROVIDERS } from "../models/index.js";
import type { CompleteToolsOptions, CompleteToolsResult, ProviderId } from "../types.js";
import { completeOpenAITools, streamOpenAITools } from "./openai.js";
import { completeAnthropicTools } from "./anthropic.js";
import { streamAnthropicTools } from "./anthropicStream.js";
import { completeGoogleTools } from "./google.js";

/** OpenAI-compatible providers → their default base URL. These are the ONLY
 *  providers whose tool-calling turn can be STREAMED today (shared SSE shape). */
const OPENAI_COMPAT_BASE: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  "openai-compat": PROVIDERS["openai-compat"].defaultBaseUrl || "http://localhost:11434/v1",
  mistral: PROVIDERS.mistral.defaultBaseUrl || "https://api.mistral.ai/v1",
  deepseek: PROVIDERS.deepseek.defaultBaseUrl || "https://api.deepseek.com/v1",
  openrouter: PROVIDERS.openrouter.defaultBaseUrl || "https://openrouter.ai/api/v1",
  scaleway: PROVIDERS.scaleway.defaultBaseUrl || "https://api.scaleway.ai/v1",
};

/** Can this provider's agentic tool turn be STREAMED (text token-by-token while
 *  tool calls are assembled from the stream)? The OpenAI-compatible endpoints can
 *  (shared SSE shape), and **Anthropic** can via its own block-structured stream
 *  (`tools/anthropicStream.ts`). Only Google's native `generateContent` tools client
 *  still falls back to the non-streaming {@link completeWithTools} — note that a
 *  PLATFORM google send (gateway `baseUrl`, OpenAI-compat shape) could stream too, but
 *  this gate is keyed on the provider alone and can't see `baseUrl`. */
export function supportsStreamingTools(provider: ProviderId): boolean {
  return provider in OPENAI_COMPAT_BASE || provider === "anthropic";
}

/**
 * STREAMING agentic turn — yields assistant text deltas, returns the assembled
 * result (text + tool calls + usage). Guard with {@link supportsStreamingTools}
 * (throws otherwise).
 */
export function streamWithTools(
  opts: CompleteToolsOptions,
): AsyncGenerator<string, CompleteToolsResult> {
  // streamAnthropicTools picks DIRECT vs PLATFORM (baseUrl → platform gateway
  // `/v1/messages`) from `opts.baseUrl`, exactly like its non-streaming twin.
  if (opts.provider === "anthropic") return streamAnthropicTools(opts);
  const base = OPENAI_COMPAT_BASE[opts.provider];
  if (!base) throw new Error(`Streaming tools unsupported for provider: ${opts.provider}`);
  return streamOpenAITools(opts, opts.baseUrl || base);
}

/**
 * One non-streaming agentic turn with tool-calling. The caller runs the loop:
 * call this, execute any returned `toolCalls`, append the assistant turn and the
 * tool results to `messages`, and call again until `toolCalls` is empty.
 *
 * Only API-key providers support tools; keyless web-session providers do not.
 */
export async function completeWithTools(
  opts: CompleteToolsOptions,
): Promise<CompleteToolsResult> {
  switch (opts.provider) {
    case "openai":
      return completeOpenAITools(opts, "https://api.openai.com/v1");
    case "openai-compat":
      return completeOpenAITools(
        opts,
        opts.baseUrl ||
          PROVIDERS["openai-compat"].defaultBaseUrl ||
          "http://localhost:11434/v1",
      );
    case "mistral":
      return completeOpenAITools(
        opts,
        opts.baseUrl || PROVIDERS.mistral.defaultBaseUrl || "https://api.mistral.ai/v1",
      );
    case "deepseek":
      return completeOpenAITools(
        opts,
        opts.baseUrl || PROVIDERS.deepseek.defaultBaseUrl || "https://api.deepseek.com/v1",
      );
    case "openrouter":
      // OpenRouter aggregator (BYO key) — OpenAI-compatible tool turn; namespaced id
      // sent as-is.
      return completeOpenAITools(
        opts,
        opts.baseUrl || PROVIDERS.openrouter.defaultBaseUrl || "https://openrouter.ai/api/v1",
      );
    case "scaleway":
      // Platform-provided (the platform's backend proxy, OpenAI-compatible) — baseUrl +
      // Supabase JWT injected by the desktop; non-streaming tool turn.
      return completeOpenAITools(
        opts,
        opts.baseUrl || PROVIDERS.scaleway.defaultBaseUrl || "https://api.scaleway.ai/v1",
      );
    case "anthropic":
      // completeAnthropicTools picks DIRECT vs PLATFORM (baseUrl → platform gateway
      // `/v1/messages`) from `opts.baseUrl`.
      return completeAnthropicTools(opts);
    case "google":
      // PLATFORM (baseUrl = platform gateway) → Gemini via Google's OpenAI-compat path
      // (Bearer JWT). DIRECT google → the native generateContent tools client.
      if (opts.baseUrl) return completeOpenAITools(opts, opts.baseUrl);
      return completeGoogleTools(opts);
    case "openai-session":
    case "anthropic-session":
    case "claude-cli":
    case "codex-cli":
    // ⚠️ `antigravity-cli` n'a PAS de tour outillé du tout (sa CLI ne peut pas porter le
    // pont MCP — mesuré). Le catalogue le marque `noTools`, donc la boucle agentique ne
    // le choisit jamais ; ce cas-ci est le filet, et il doit nommer la vraie raison
    // plutôt que « Unknown provider ».
    case "antigravity-cli":
      // claude-cli included, and it is a GUARD, not the path: the desktop branches to its
      // own subscription engine before this call (`main/index.ts`), because a CLI turn has
      // no tool-calling wire — its tools ride an MCP bridge the desktop alone can run. Any
      // OTHER host reaching here has no way to serve them, so it must fail rather than
      // silently answer without the tools it was asked to use.
      throw new Error(
        `Keyless provider '${opts.provider}' cannot use tools — use an API-key model.`,
      );
    default:
      throw new Error(`Unknown provider: ${opts.provider}`);
  }
}
