import { streamOpenAI } from "./providers/openai.js";
import { streamAnthropic } from "./providers/anthropic.js";
import { streamGoogle } from "./providers/google.js";
import { PROVIDERS } from "./models/index.js";
import type { StreamChatOptions, StreamDone } from "./types.js";

export * from "./types.js";
export * from "./models/index.js";
export * from "./modelMeta.js";
export { completeWithTools, streamWithTools, supportsStreamingTools } from "./tools/index.js";
// What a 429 actually is (a burst vs a spent quota) — shared with the app, which words
// the failure for the user from the SAME parse the retry policy uses.
export { rateLimitInfo, providerCreditsExhausted, type RateLimitInfo } from "./apiError.js";

/**
 * Stream a chat completion from any supported provider as an async generator of
 * text deltas. Runs in a Node context (the Electron main process), so there are
 * no CORS restrictions and API keys never touch the renderer. The generator's
 * RETURN value carries token usage when the provider reports it (consume via
 * manual iteration: the final `next()` result's `value` is the `TokenUsage`).
 */
export async function* streamChat(
  opts: StreamChatOptions,
): AsyncGenerator<string, StreamDone | undefined> {
  switch (opts.provider) {
    case "openai":
      return yield* streamOpenAI(opts, "https://api.openai.com/v1");
    case "openai-compat":
      return yield* streamOpenAI(
        opts,
        opts.baseUrl ||
          PROVIDERS["openai-compat"].defaultBaseUrl ||
          "http://localhost:11434/v1",
      );
    case "mistral":
      // Mistral exposes an OpenAI-compatible API.
      return yield* streamOpenAI(
        opts,
        opts.baseUrl || PROVIDERS.mistral.defaultBaseUrl || "https://api.mistral.ai/v1",
      );
    case "deepseek":
      // DeepSeek exposes an OpenAI-compatible API (BYO key).
      return yield* streamOpenAI(
        opts,
        opts.baseUrl || PROVIDERS.deepseek.defaultBaseUrl || "https://api.deepseek.com/v1",
      );
    case "openrouter":
      // OpenRouter aggregator (BYO key) — OpenAI-compatible; the namespaced id is the
      // wire id, sent as-is to `/chat/completions`.
      return yield* streamOpenAI(
        opts,
        opts.baseUrl || PROVIDERS.openrouter.defaultBaseUrl || "https://openrouter.ai/api/v1",
      );
    case "scaleway":
      // PLATFORM-PROVIDED: proxied by the platform's backend (OpenAI-compatible). The
      // desktop injects baseUrl=<backend>/api-features/inference + the Supabase
      // JWT as opts.apiKey — no provider key.
      return yield* streamOpenAI(
        opts,
        opts.baseUrl || PROVIDERS.scaleway.defaultBaseUrl || "https://api.scaleway.ai/v1",
      );
    case "anthropic":
      // streamAnthropic picks DIRECT (user key) vs PLATFORM (baseUrl = platform gateway,
      // Supabase JWT → `${baseUrl}/v1/messages`) from `opts.baseUrl`.
      return yield* streamAnthropic(opts);
    case "google":
      // PLATFORM (keyless member): a set baseUrl means the platform's gateway, which serves
      // Gemini via Google's OpenAI-compat endpoint — so stream through the OpenAI path
      // (Bearer JWT → `${baseUrl}/chat/completions`). DIRECT google (no baseUrl) uses
      // the native generateContent client.
      if (opts.baseUrl) return yield* streamOpenAI(opts, opts.baseUrl);
      return yield* streamGoogle(opts);
    case "openai-session":
    case "anthropic-session":
      // Keyless web-session providers are driven by the app's hidden webview
      // bridge (they need the browser session + cookies), not by this client.
      throw new Error(
        `The '${opts.provider}' provider is handled by the app's session bridge, not streamChat().`,
      );
    default:
      throw new Error(`Unknown provider: ${opts.provider}`);
  }
}
