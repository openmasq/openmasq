/**
 * ESTIMATED public list prices, USD per 1M tokens (input / output). Approximate
 * and provider-set — they change; treat any total as a rough estimate, not a bill.
 * Local (Ollama / openai-compat) and keyless models are free → omitted (no cost).
 */
export interface ModelPrice {
  /** USD per 1M input tokens. */
  in: number;
  /** USD per 1M output tokens. */
  out: number;
}
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // OpenAI — current GPT-5.x family.
  "gpt-5.5": { in: 5, out: 30 },
  "gpt-5.4": { in: 2.5, out: 15 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  "gpt-5.4-nano": { in: 0.2, out: 1.25 },
  // OpenAI — previous-gen (deprecated by OpenAI, still callable).
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  o3: { in: 2, out: 8 },
  "o4-mini": { in: 1.1, out: 4.4 },
  "o3-mini": { in: 1.1, out: 4.4 },
  // Anthropic (current)
  "claude-fable-5": { in: 10, out: 50 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  // Anthropic — previous generation.
  "claude-sonnet-4-6": { in: 3, out: 15 },
  // Google Gemini (paid tier, USD / 1M tokens; Pro shown at the ≤200k base tier)
  "gemini-3.1-pro-preview": { in: 2, out: 12 },
  "gemini-3.5-flash": { in: 1.5, out: 9 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  // Mistral (pinned ids offered in the picker + `-latest` kept for legacy convos).
  "mistral-large-2512": { in: 2, out: 6 },
  "mistral-medium-2508": { in: 0.4, out: 2 },
  "mistral-small-2506": { in: 0.2, out: 0.6 },
  "ministral-8b-2512": { in: 0.1, out: 0.1 },
  "mistral-large-latest": { in: 2, out: 6 },
  "mistral-medium-latest": { in: 0.4, out: 2 },
  "mistral-small-latest": { in: 0.2, out: 0.6 },
  "codestral-latest": { in: 0.3, out: 0.9 },
  "pixtral-large-latest": { in: 2, out: 6 },
  "ministral-8b-latest": { in: 0.1, out: 0.1 },
  // DeepSeek (hosted API, USD / 1M tokens — cache-miss input).
  "deepseek-v4-pro": { in: 0.435, out: 0.87 },
  "deepseek-v4-flash": { in: 0.14, out: 0.28 },
  // OpenRouter (BYO key, USD / 1M tokens — from the live OpenRouter catalogue; still
  // provider-set + subject to change). A `:free` tier is 0/0 — and since the CURATED ids
  // are served on the platform's key, a free registry model works with NO key nor
  // subscription (the credits free pass only applies on the platform path). A dynamically
  // discovered slug, on the other hand, stays BYO — it is not in the allow-list.
  "x-ai/grok-4.20": { in: 1.25, out: 2.5 },
  "openai/gpt-5.6-luna": { in: 0.1, out: 0.6 },
  "moonshotai/kimi-k2.6": { in: 0.6, out: 3.41 },
  "deepseek/deepseek-chat-v3.1": { in: 0.25, out: 0.95 },
  "qwen/qwen3-vl-32b-instruct": { in: 0.1, out: 0.42 },
  "qwen/qwen3-235b-a22b": { in: 0.46, out: 1.82 },
  "meta-llama/llama-3.3-70b-instruct": { in: 0.13, out: 0.4 },
  "mistralai/mistral-small-3.2-24b-instruct": { in: 0.1, out: 0.3 },
  "poolside/laguna-s-2.1:free": { in: 0, out: 0 },
  "nvidia/nemotron-3-ultra-550b-a55b:free": { in: 0, out: 0 },
  "nvidia/nemotron-3-super-120b-a12b:free": { in: 0, out: 0 },
  "google/gemma-4-31b-it:free": { in: 0, out: 0 },
  "google/gemma-4-26b-a4b-it:free": { in: 0, out: 0 },
  "openai/gpt-oss-20b:free": { in: 0, out: 0 },
  "cohere/north-mini-code:free": { in: 0, out: 0 },
  "tencent/hy3:free": { in: 0, out: 0 },
  "nvidia/nemotron-nano-9b-v2:free": { in: 0, out: 0 },
  // Scaleway Generative API — prices are in EUR (not USD). The credit engine's
  // ×USD_TO_EUR conversion slightly under-counts these, within the "approximate
  // budget" tolerance. (This table is the ONE price source: `@openmasq/credits`
  // imports it and the backend imports that — there is no second copy anywhere.)
  "glm-5.2": { in: 1.8, out: 5.5 },
  "qwen3.5-397b-a17b": { in: 0.6, out: 3.6 },
  "qwen3.6-35b-a3b": { in: 0.25, out: 1.5 },
  "gemma-4-26b-a4b-it": { in: 0.25, out: 0.5 },
  "mistral-medium-3.5-128b": { in: 1.5, out: 7.5 },
  "llama-3.3-70b-instruct": { in: 0.9, out: 0.9 },
  "qwen3-235b-a22b-instruct-2507": { in: 0.75, out: 2.25 },
  "qwen3-coder-30b-a3b-instruct": { in: 0.2, out: 0.8 },
  "pixtral-12b-2409": { in: 0.2, out: 0.2 },
  "mistral-small-3.2-24b-instruct-2506": { in: 0.15, out: 0.35 },
  "devstral-2-123b-instruct-2512": { in: 0.4, out: 2.0 },
  "gpt-oss-120b": { in: 0.15, out: 0.6 },
  "gemma-3-27b-it": { in: 0.25, out: 0.5 },
  "holo2-30b-a3b": { in: 0.3, out: 0.7 },
};

/** Estimated USD cost of a model turn from its token counts (0 when unpriced). */
export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[modelId];
  if (!p) return 0;
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
}
