/**
 * Context window (max tokens) per model — a fixed model property, shown in the
 * picker. Approximate; local (Ollama) models vary by build → omitted.
 */
export const MODEL_CONTEXT: Record<string, number> = {
  // OpenAI — current GPT-5.x family. GPT-5.5's API window is 1M (the 400K figure is
  // the Codex CLI cap, not the API); GPT-5.4 stays at 400K.
  "gpt-5.5": 1_000_000,
  "gpt-5.4": 400_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  // OpenAI — previous-gen (deprecated, still callable).
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4.1": 1_000_000,
  "gpt-4.1-mini": 1_000_000,
  "gpt-4.1-nano": 1_000_000,
  o3: 200_000,
  "o4-mini": 200_000,
  "o3-mini": 200_000,
  // Anthropic (current) — 1M context (Haiku 200K).
  "claude-fable-5": 1_000_000,
  "claude-opus-4-8": 1_000_000,
  "claude-sonnet-5": 1_000_000,
  "claude-haiku-4-5": 200_000,
  // Anthropic — previous generation.
  "claude-sonnet-4-6": 1_000_000,
  // Subscription via the Claude Code CLI: the window depends on the model the
  // subscription serves; 200K is the common floor of the range, never a promise beyond it.
  "claude-cli": 200_000,
  "claude-cli-sonnet": 200_000,
  "claude-cli-opus": 200_000,
  "claude-cli-haiku": 200_000,
  // ChatGPT subscription via the Codex CLI: the window is that of the model the
  // account serves; 400K is the floor of the GPT-5.x range, never a promise beyond it.
  "codex-cli": 400_000,
  // Antigravity serves Gemini 3.x by default — the window Google announces for that family.
  "antigravity-cli": 1_000_000,
  // Google Gemini — 3.1 Pro is a 2M-token model (official); the Flash/Flash-Lite
  // tiers are 1M.
  "gemini-3.1-pro-preview": 2_000_000,
  "gemini-3.5-flash": 1_000_000,
  "gemini-3.1-flash-lite": 1_000_000,
  "gemini-2.5-pro": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.5-flash-lite": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  // Mistral (pinned ids + `-latest` kept for legacy convos). The Mistral 3 family
  // (Large 3 / Medium 3.5) moved to a 256K window — confirmed on the official
  // model cards (docs.mistral.ai) + HF. Small 3.x / Ministral 8B stay at 128K.
  "mistral-large-2512": 256_000,
  "mistral-medium-2508": 256_000,
  "mistral-small-2506": 128_000,
  "ministral-8b-2512": 128_000,
  "mistral-large-latest": 256_000,
  "mistral-medium-latest": 256_000,
  "mistral-small-latest": 128_000,
  "codestral-latest": 256_000,
  "pixtral-large-latest": 128_000,
  "ministral-8b-latest": 128_000,
  // DeepSeek V4 — 1M-token window (official, api.deepseek.com).
  "deepseek-v4-pro": 1_000_000,
  "deepseek-v4-flash": 1_000_000,
  // OpenRouter (BYO key) — context windows from the live OpenRouter catalogue.
  "x-ai/grok-4.20": 2_000_000,
  "openai/gpt-5.6-luna": 1_050_000,
  "moonshotai/kimi-k2.6": 262_144,
  "deepseek/deepseek-chat-v3.1": 163_840,
  "qwen/qwen3-vl-32b-instruct": 262_144,
  "qwen/qwen3-235b-a22b": 131_072,
  "meta-llama/llama-3.3-70b-instruct": 131_072,
  "mistralai/mistral-small-3.2-24b-instruct": 131_072,
  "poolside/laguna-s-2.1:free": 262_144,
  "nvidia/nemotron-3-ultra-550b-a55b:free": 1_000_000,
  "nvidia/nemotron-3-super-120b-a12b:free": 1_000_000,
  "google/gemma-4-31b-it:free": 262_144,
  "google/gemma-4-26b-a4b-it:free": 262_144,
  "openai/gpt-oss-20b:free": 131_072,
  "cohere/north-mini-code:free": 256_000,
  "tencent/hy3:free": 262_144,
  "nvidia/nemotron-nano-9b-v2:free": 128_000,
  // Scaleway (approximate — verify against the Scaleway model docs).
  // GLM-5.2 is NATIVELY a 1M-token model (Z.ai official spec: 1,000,000 in / 128K out;
  // June 2026, ~750B MoE, MIT). The old 128K here was the stale GLM-4.5-era figure.
  // Scaleway doesn't publish its EXACT exposed window in a scrapable form and may cap
  // below 1M on serverless (VRAM); other providers serve GLM-5.2 at 256K, so we use a
  // conservative 256K — corrected + safe for the tool-router (never overflows). Bump to
  // 1_000_000 once Scaleway's catalog confirms it exposes the full native window.
  "glm-5.2": 256_000,
  "qwen3.5-397b-a17b": 256_000,
  "qwen3.6-35b-a3b": 256_000,
  "gemma-4-26b-a4b-it": 128_000,
  "mistral-medium-3.5-128b": 128_000,
  "llama-3.3-70b-instruct": 128_000,
  "qwen3-235b-a22b-instruct-2507": 256_000,
  "qwen3-coder-30b-a3b-instruct": 256_000,
  "pixtral-12b-2409": 128_000,
  "mistral-small-3.2-24b-instruct-2506": 128_000,
  "devstral-2-123b-instruct-2512": 256_000,
  "gpt-oss-120b": 128_000,
  "gemma-3-27b-it": 128_000,
  "holo2-30b-a3b": 128_000,
};

/** The model's context window (max total tokens), or `undefined` if unknown.
 *  Used to size the MCP tool payload — the tool JSON schemas dominate the prompt,
 *  so `mcpAgent` compares their estimated weight against this before a tool call. */
export function contextWindow(modelId: string): number | undefined {
  return MODEL_CONTEXT[modelId];
}

/**
 * Rate limit — tokens/minute — per model. ⚠️ ACCOUNT/TIER-SPECIFIC and provider-
 * set: these are indicative values (currently the hosted-Mistral console figures)
 * and can differ on another account. Only present where we have real data; the
 * picker shows it as an indicator, never a guarantee. A low value (≤ 50k) on the
 * token-heavy MCP tool path throttles fast — the picker flags it.
 */
export const MODEL_TPM: Record<string, number> = {
  // Mistral (hosted API — from the account console; the `-latest` alias has a far
  // lower bucket than the pinned snapshots, e.g. medium-2508 = 356 250 TPM).
  "mistral-medium-latest": 25_000,
  "mistral-medium-2508": 356_250,
  "mistral-medium-2505": 375_000,
  "mistral-small-2506": 2_250_000,
  "ministral-8b-2512": 625_000,
  "mistral-large-2512": 250_000,
  "codestral-2508": 625_000,
};
