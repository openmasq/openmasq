import type { TokenUsage } from "../types.js";
import { sseJsonEvents } from "./sse.js";

/**
 * Token accounting, read from each provider's wire shape into the ONE
 * {@link TokenUsage} the whole monorepo speaks.
 *
 * This file exists because "how many tokens did that cost" was answered
 * independently by the desktop client (for the journal) and by the gateway (for the
 * BILL), from the same bytes, with different field sets — and the two answers had
 * already diverged on Anthropic's cache counters. Token accounting sits on money;
 * it gets one home, and both readers import it.
 *
 * ⚠️ The invariant every extractor here upholds, and the reason a hand-rolled copy
 * is dangerous: **`inputTokens` is ALWAYS the FULL prompt, cache included**, and
 * `cachedInputTokens` / `cacheWriteInputTokens` are PARTS of it. OpenAI already
 * counts that way (`prompt_tokens` includes cached); Anthropic does NOT
 * (`input_tokens` excludes both cache counters), so its reader adds them back.
 */

/** Anthropic (`/v1/messages`) — `usage` from `message_start`, `message_delta`, or a
 *  non-stream body. Folds `cache_read`/`cache_creation` back into `inputTokens`. */
export function anthropicUsage(raw: unknown): TokenUsage | undefined {
  const u = raw as
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      }
    | undefined;
  if (!u) return undefined;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: (u.input_tokens ?? 0) + read + write,
    outputTokens: u.output_tokens ?? 0,
    ...(u.cache_read_input_tokens != null ? { cachedInputTokens: read } : {}),
    ...(u.cache_creation_input_tokens != null ? { cacheWriteInputTokens: write } : {}),
  };
}

/** OpenAI-compatible (`/chat/completions`) — `prompt_tokens` ALREADY includes the
 *  cached part, so `cached_tokens` is only surfaced, never added. */
export function openaiUsage(raw: unknown): TokenUsage | undefined {
  const u = raw as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      }
    | undefined;
  if (!u) return undefined;
  const cached = u.prompt_tokens_details?.cached_tokens;
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    ...(cached != null ? { cachedInputTokens: cached } : {}),
  };
}

/** Google (`generateContent`) — `usageMetadata`. No cache counters reported. */
export function googleUsage(raw: unknown): TokenUsage | undefined {
  const u = raw as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
  if (!u) return undefined;
  return {
    inputTokens: u.promptTokenCount ?? 0,
    outputTokens: u.candidatesTokenCount ?? 0,
  };
}

// ---- Buffered scans, for a proxy that held the whole stream and meters it after ----

/** Usage from a COMPLETE OpenAI-compatible SSE buffer (the terminal
 *  `stream_options.include_usage` chunk). The LAST one seen wins. */
export function openaiUsageFromSse(sseText: string): TokenUsage | undefined {
  let usage: TokenUsage | undefined;
  for (const evt of sseJsonEvents<{ usage?: unknown }>(sseText)) {
    const u = openaiUsage(evt?.usage);
    if (u) usage = u;
  }
  return usage;
}

/**
 * Usage from a COMPLETE Anthropic SSE buffer. The counts arrive SPLIT: the input
 * side (and both cache counters) on `message_start`, the output side accumulating on
 * `message_delta` — whose final value is cumulative, so the last one wins. A reader
 * that took only `message_start` would report `output_tokens: 1`.
 */
export function anthropicUsageFromSse(sseText: string): TokenUsage | undefined {
  let usage: TokenUsage | undefined;
  for (const evt of sseJsonEvents<{
    type?: string;
    message?: { usage?: unknown };
    usage?: { output_tokens?: number };
  }>(sseText)) {
    if (evt?.type === "message_start") {
      usage = anthropicUsage(evt.message?.usage) ?? usage;
    } else if (evt?.type === "message_delta" && evt.usage) {
      // `message_delta` carries the running output count (and, on newer versions,
      // repeats the input side). Merge rather than replace: dropping the
      // `message_start` input+cache counts here is exactly the under-count this
      // module exists to prevent.
      const delta = anthropicUsage(evt.usage);
      if (delta) {
        usage = usage
          ? { ...usage, outputTokens: delta.outputTokens || usage.outputTokens }
          : delta;
      }
    }
  }
  return usage;
}
