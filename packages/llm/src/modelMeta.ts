/**
 * Per-model qualitative metadata for the model picker's detail panel.
 *
 * HONESTY: this carries NO fabricated benchmark numbers. The `profile` is a
 * RELATIVE 1–5 positioning derived from each model's family + tier (Opus > Sonnet
 * > Haiku; flagship > mini > nano; Pro > Flash > Flash-Lite; Large > Medium >
 * Small; reasoning models o-series/DeepSeek-R1; coding models Codestral/Qwen-Coder),
 * NOT a measured score. `cost` is inverted so HIGHER = cheaper ("Économie").
 * The qualitative copy (strengths / weaknesses / best-for) is positioning, not metrics,
 * and lives in `@openmasq/i18n` (`modelCatalog.models`, one entry per id here — parity
 * pinned by the UI's `help/catalogCopy.test.ts`). `benchmarks` is
 * only ever populated with confidently-known REAL published figures — omitted
 * everywhere we don't have a reliable source (i.e. everywhere, for now).
 */
export interface ModelProfile {
  /** 1 (basic) → 5 (state of the art). */
  reasoning: number;
  coding: number;
  /** Latency: 1 (slow) → 5 (very fast). */
  speed: number;
  /** Price: 1 (expensive) → 5 (cheap). */
  cost: number;
  /** Vision / multimodal: 1 (text only) → 5 (strongly multimodal). */
  multimodal: number;
}

/** A capability chip, by ID — the words live in `@openmasq/i18n` (`modelCatalog.tags`). */
export type ModelTag =
  | "reasoning"
  | "code"
  | "vision"
  | "fast"
  | "cheap"
  | "oss"
  | "long"
  | "agent";
/** The family an UNKNOWN id fell back on — the UI picks that family's copy. */
export type ModelFallbackTier = "premium" | "light" | "generic";

export interface ModelMeta {
  profile: ModelProfile;
  /** Capability chips, by id. */
  tags: ModelTag[];
  /** Set only by `fallbackMeta`: this id has no entry of its own. */
  fallback?: ModelFallbackTier;
  /** True = open-weight model (downloadable), even when the platform hosts it. */
  openSource: boolean;
  /** REAL published figures only; omitted when we have no reliable source. */
  benchmarks?: { name: string; score: string }[];
}

type P = [reasoning: number, coding: number, speed: number, cost: number, multimodal: number];
function m(p: P, tags: ModelTag[], openSource: boolean): ModelMeta {
  return {
    profile: { reasoning: p[0], coding: p[1], speed: p[2], cost: p[3], multimodal: p[4] },
    tags,
    openSource,
  };
}

// The chip ids (kept short so the table stays readable).
const RAIS: ModelTag = "reasoning";
const CODE: ModelTag = "code";
const VISION: ModelTag = "vision";
const FAST: ModelTag = "fast";
const CHEAP: ModelTag = "cheap";
const OSS: ModelTag = "oss";
const LONG: ModelTag = "long";
const AGENT: ModelTag = "agent";

/** id → metadata. Covers EVERY id in `MODELS`. */
export const MODEL_META: Record<string, ModelMeta> = {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  "gpt-5.5": m([5, 5, 2, 1, 5], [RAIS, CODE, VISION, AGENT, LONG], false),
  "gpt-5.4": m([5, 5, 3, 2, 5], [RAIS, CODE, VISION, AGENT], false),
  "gpt-5.4-mini": m([4, 4, 4, 4, 5], [FAST, CODE, VISION], false),
  "gpt-5.4-nano": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION], false),
  "gpt-4.1": m([4, 5, 3, 3, 5], [CODE, VISION, LONG], false),
  "gpt-4.1-mini": m([3, 4, 4, 4, 5], [FAST, CODE, VISION, LONG], false),
  "gpt-4.1-nano": m([2, 3, 5, 5, 4], [FAST, CHEAP, LONG], false),
  "gpt-4o": m([3, 4, 4, 3, 5], [VISION, FAST], false),
  "gpt-4o-mini": m([2, 3, 5, 5, 4], [FAST, CHEAP, VISION], false),
  o3: m([5, 5, 2, 3, 4], [RAIS, CODE], false),
  "o4-mini": m([4, 4, 4, 4, 4], [RAIS, FAST], false),
  "o3-mini": m([4, 4, 4, 4, 1], [RAIS, FAST], false),

  // ── Anthropic ─────────────────────────────────────────────────────────────
  "claude-fable-5": m([5, 5, 3, 1, 5], [RAIS, CODE, AGENT, VISION, LONG], false),
  "claude-opus-4-8": m([5, 5, 3, 2, 5], [RAIS, CODE, AGENT, VISION, LONG], false),
  "claude-sonnet-5": m([5, 5, 4, 3, 5], [RAIS, CODE, AGENT, VISION, LONG], false),
  "claude-sonnet-4-6": m([4, 5, 4, 3, 5], [CODE, VISION, LONG], false),
  // The Claude subscription via the Claude Code CLI (`cost: 5` = already paid for by the subscription).
  // The positioning is that of the FAMILY the alias serves — the exact model is
  // whichever current one the subscription uses (the three variants share strengths/limits).
  "claude-cli": m([5, 5, 3, 5, 1], [RAIS, CODE, LONG], false),
  "claude-cli-sonnet": m([5, 5, 4, 5, 1], [RAIS, CODE, LONG], false),
  "claude-cli-opus": m([5, 5, 3, 5, 1], [RAIS, CODE, LONG], false),
  // The ChatGPT subscription via the Codex CLI — same logic as claude-cli (`cost: 5` =
  // already paid for by the subscription, not "free").
  "codex-cli": m([5, 5, 3, 5, 1], [RAIS, CODE, LONG], false),
  // L'abonnement Antigravity : même logique (`cost: 5` = pas de facturation au token ici).
  "antigravity-cli": m([5, 4, 4, 5, 1], [RAIS, CODE, LONG], false),
  "claude-cli-haiku": m([3, 3, 5, 5, 1], [CODE, LONG], false),
  "claude-haiku-4-5": m([3, 4, 5, 4, 5], [FAST, VISION], false),

  // ── Google Gemini ─────────────────────────────────────────────────────────
  "gemini-3.1-pro-preview": m([5, 4, 3, 3, 5], [RAIS, VISION, LONG], false),
  "gemini-3.5-flash": m([4, 4, 5, 4, 5], [FAST, VISION, LONG], false),
  "gemini-3.1-flash-lite": m([3, 3, 5, 5, 4], [FAST, CHEAP, LONG], false),
  "gemini-2.5-pro": m([4, 4, 3, 3, 5], [RAIS, VISION, LONG], false),
  "gemini-2.5-flash": m([3, 3, 5, 4, 5], [FAST, VISION, LONG], false),
  "gemini-2.5-flash-lite": m([2, 2, 5, 5, 4], [FAST, CHEAP], false),
  "gemini-2.0-flash": m([3, 3, 5, 5, 5], [FAST, CHEAP, VISION, LONG], false),

  // ── Mistral (hosted) ──────────────────────────────────────────────────────
  "mistral-large-2512": m([4, 4, 3, 3, 1], [RAIS, CODE], false),
  "mistral-medium-2508": m([4, 4, 4, 4, 4], [CODE, VISION], false),
  "mistral-small-2506": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION, OSS], true),
  "codestral-latest": m([3, 5, 4, 5, 1], [CODE, FAST, OSS], true),
  "pixtral-large-latest": m([4, 3, 3, 3, 5], [VISION, OSS], true),
  "ministral-8b-2512": m([3, 3, 5, 5, 1], [FAST, CHEAP, OSS], true),

  // ── DeepSeek (hosted API, personal key) ───────────────────────────────────
  "deepseek-v4-pro": m([5, 5, 3, 4, 1], [RAIS, CODE, OSS, LONG], true),
  "deepseek-v4-flash": m([4, 4, 5, 5, 1], [FAST, CODE, CHEAP, OSS, LONG], true),

  // ── OpenRouter (multi-vendor aggregator, personal key) ────────────────────
  // Relative family/tier positioning; ids verified in the OpenRouter catalogue.
  "openai/gpt-5.6-luna": m([4, 4, 5, 5, 4], [FAST, CHEAP, VISION, LONG, AGENT], true),
  "moonshotai/kimi-k2.6": m([4, 5, 4, 4, 4], [CODE, AGENT, OSS, VISION], true),
  "x-ai/grok-4.20": m([5, 4, 4, 3, 4], [RAIS, VISION, LONG, AGENT], false),
  "deepseek/deepseek-chat-v3.1": m([4, 5, 4, 4, 1], [CODE, RAIS, OSS], true),
  "qwen/qwen3-vl-32b-instruct": m([4, 4, 4, 5, 4], [VISION, CODE, OSS, CHEAP], true),
  "qwen/qwen3-235b-a22b": m([4, 4, 3, 4, 1], [RAIS, CODE, OSS], true),
  "meta-llama/llama-3.3-70b-instruct": m([4, 4, 4, 5, 1], [OSS, CHEAP], true),
  "mistralai/mistral-small-3.2-24b-instruct": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION, OSS], true),
  "poolside/laguna-s-2.1:free": m([4, 4, 4, 5, 1], [FAST, CHEAP, LONG, AGENT], true),
  "nvidia/nemotron-3-ultra-550b-a55b:free": m([5, 4, 2, 5, 1], [RAIS, OSS, CHEAP, LONG], true),
  "nvidia/nemotron-3-super-120b-a12b:free": m([4, 4, 3, 5, 1], [RAIS, OSS, CHEAP, LONG], true),
  "google/gemma-4-31b-it:free": m([3, 3, 4, 5, 4], [VISION, OSS, CHEAP], true),
  "google/gemma-4-26b-a4b-it:free": m([3, 3, 5, 5, 4], [FAST, VISION, OSS, CHEAP], true),
  "openai/gpt-oss-20b:free": m([3, 3, 5, 5, 1], [FAST, OSS, CHEAP], true),
  "cohere/north-mini-code:free": m([2, 4, 5, 5, 1], [CODE, FAST, CHEAP], false),
  "tencent/hy3:free": m([4, 4, 4, 5, 1], [RAIS, OSS, CHEAP], true),
  "nvidia/nemotron-nano-9b-v2:free": m([3, 3, 5, 5, 1], [FAST, OSS, CHEAP], true),

  // ── OpenAI-compatible / local (Ollama, open-weight) ───────────────────────
  "llama3.3": m([4, 4, 4, 5, 1], [OSS, CODE], true),
  "llama3.1": m([3, 3, 4, 5, 1], [OSS], true),
  "qwen2.5": m([4, 4, 4, 5, 1], [OSS, CODE], true),
  "qwen2.5-coder": m([3, 5, 4, 5, 1], [CODE, OSS], true),
  "deepseek-r1": m([5, 4, 2, 5, 1], [RAIS, OSS], true),
  gemma2: m([3, 3, 4, 5, 1], [OSS, FAST], true),
  phi4: m([4, 3, 5, 5, 1], [OSS, FAST, RAIS], true),
  "mistral-nemo": m([3, 3, 4, 5, 1], [OSS], true),

  // ── Scaleway — platform (included in the subscription) ────────────────────────
  "glm-5.2": m([4, 4, 3, 3, 1], [RAIS, CODE, OSS, LONG], true),
  "qwen3.5-397b-a17b": m([5, 5, 3, 4, 4], [RAIS, CODE, VISION, OSS], true),
  "qwen3.6-35b-a3b": m([4, 4, 4, 5, 4], [FAST, CODE, VISION, OSS], true),
  "gemma-4-26b-a4b-it": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION, OSS], true),
  "mistral-medium-3.5-128b": m([4, 4, 4, 4, 4], [CODE, VISION], false),
  "llama-3.3-70b-instruct": m([4, 4, 3, 3, 1], [RAIS, OSS], true),
  "qwen3-235b-a22b-instruct-2507": m([5, 4, 3, 3, 1], [RAIS, OSS, LONG], true),
  "qwen3-coder-30b-a3b-instruct": m([4, 5, 4, 4, 1], [CODE, FAST, OSS, LONG], true),
  "pixtral-12b-2409": m([3, 3, 4, 4, 4], [VISION, CHEAP, OSS], true),
  "mistral-small-3.2-24b-instruct-2506": m([3, 4, 4, 5, 4], [VISION, FAST, CHEAP], true),
  "devstral-2-123b-instruct-2512": m([4, 5, 3, 3, 1], [CODE, AGENT, OSS, LONG], true),
  "gpt-oss-120b": m([4, 4, 4, 5, 1], [RAIS, OSS, CHEAP], true),
  "gemma-3-27b-it": m([3, 3, 4, 4, 4], [VISION, FAST, OSS], true),
  "holo2-30b-a3b": m([4, 4, 4, 4, 4], [VISION, OSS, FAST], true),
};

/** Generic fallback by family, so an unknown/legacy id never crashes the panel. */
function fallbackMeta(id: string): ModelMeta {
  const l = id.toLowerCase();
  if (/opus|fable|gpt-5\.5|397b|-pro|o3\b|large|r1/.test(l))
    return { ...m([4, 4, 3, 3, 3], [RAIS], false), fallback: "premium" };
  if (/mini|nano|lite|flash|small|haiku|8b|nemo|gemma|phi/.test(l))
    return { ...m([3, 3, 5, 5, 3], [FAST], false), fallback: "light" };
  return { ...m([3, 3, 4, 4, 3], [], false), fallback: "generic" };
}

/** Metadata for a model id (family fallback for unknown/legacy ids). */
export function modelMeta(id: string): ModelMeta {
  return MODEL_META[id] ?? fallbackMeta(id);
}
