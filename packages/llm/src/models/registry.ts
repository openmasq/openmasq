import type { ModelInfo } from "../types.js";

export const MODELS: ModelInfo[] = [
  // OpenAI — current GPT-5.x family, then the still-callable previous-gen models
  // (GPT-4o/4.1 + o-series are DEPRECATED by OpenAI but not yet removed, so they
  // stay as options). All multimodal except o3-mini. The o-series and GPT-5.x are
  // reasoning models → the OpenAI-compatible path omits `temperature` (see
  // `omitsTemperature`); gpt-4o/4.1 keep it.
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", vision: true },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", vision: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", provider: "openai", vision: true },
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano", provider: "openai", vision: true },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "openai", vision: true },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai", vision: true },
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano", provider: "openai", vision: true },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", vision: true },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "openai", vision: true },
  { id: "o3", label: "o3", provider: "openai", vision: true },
  { id: "o4-mini", label: "o4-mini", provider: "openai", vision: true },
  { id: "o3-mini", label: "o3-mini", provider: "openai" },

  // Anthropic — all accept images + PDF. Fable 5 is the most capable; Sonnet 5 is
  // the current Sonnet, Sonnet 4.6 kept as the previous generation.
  { id: "claude-fable-5", label: "Claude Fable 5", provider: "anthropic", vision: true },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "anthropic", vision: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", vision: true },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", vision: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", vision: true },

  // L'abonnement Claude de l'utilisateur, via SA CLI Claude Code installée (headless).
  // Ces ids ne sont jamais des ids de wire : ce chemin ne parle à aucune API — le
  // suffixe devient l'alias `--model` de la CLI (`subscription/turn.ts` cliModelAlias),
  // qui le résout vers le modèle COURANT de la famille. `claude-cli` nu = le défaut de
  // l'abonnement, sans drapeau (l'entrée historique — des conversations y sont
  // épinglées). `noTools` : le tour headless retire ses outils ; texte seul (les
  // pièces jointes sont refusées tôt par le pont). Opus dépend de l'offre (absent du
  // plan Pro) : la CLI refuse alors le tour, son message remonte tel quel.
  { id: "claude-cli", label: "Claude Code", provider: "claude-cli", noTools: true },
  { id: "claude-cli-sonnet", label: "Claude Sonnet", provider: "claude-cli", noTools: true },
  { id: "claude-cli-opus", label: "Claude Opus", provider: "claude-cli", noTools: true },
  { id: "claude-cli-haiku", label: "Claude Haiku", provider: "claude-cli", noTools: true },

  // Google Gemini
  // Gemini 1.5 was retired by Google (404 on generateContent) — dropped; old
  // conversations remap to 2.5 via LEGACY_MODEL_ALIASES in packages/ui/models.ts.
  // Gemini — all multimodal (images/PDF)
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", provider: "google", vision: true },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "google", vision: true },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "google", vision: true },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", vision: true },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", vision: true },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "google", vision: true },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google", vision: true },

  // Mistral (hosted API). Pinned snapshots rather than the `-latest` aliases:
  // on the hosted tier the aliases get a far lower tokens/min bucket (medium-latest
  // = 25k TPM vs medium-2508 = 356k), which throttled the token-heavy MCP tool
  // path hard. Same price per tier. Old convos remap via LEGACY_MODEL_ALIASES.
  { id: "mistral-large-2512", label: "Mistral Large", provider: "mistral" },
  { id: "mistral-medium-2508", label: "Mistral Medium", provider: "mistral", vision: true },
  { id: "mistral-small-2506", label: "Mistral Small", provider: "mistral", vision: true },
  { id: "codestral-latest", label: "Codestral", provider: "mistral" },
  { id: "pixtral-large-latest", label: "Pixtral Large", provider: "mistral", vision: true },
  { id: "ministral-8b-2512", label: "Ministral 8B", provider: "mistral" },

  // DeepSeek (hosted API, BYO key). OpenAI-compatible; sends route through the
  // OpenAI provider path. Text-only (the DeepSeek API exposes no vision). 1M context.
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "deepseek" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek" },

  // OpenRouter — a multi-vendor aggregator reached with ONE OpenRouter key (BYO,
  // never the platform's). OpenAI-compatible `/chat/completions`, so sends route through
  // the OpenAI provider path; the registry id IS the wire id (namespaced
  // `vendor/model`, `:free` for the no-cost tiers). A CURATED subset; the full
  // catalogue is hundreds of models. Per-model vendor logos resolve from the id
  // (deepseek/qwen/mistral/grok/nemotron/gemma…); the rest fall back to the house mark.
  // ⚠️ SLUGS ARE VOLATILE: OpenRouter renames/retires models and — especially — GATES
  // `:free` tiers (a `:free` slug 404s "use the paid slug instead" the moment its
  // sponsor pulls it). These ids were verified against the live GET /api/v1/models
  // catalogue; re-verify there before adding/renaming (never guess a `:free` slug).
  // Les deux entrées de la LISTE SIMPLIFIÉE du sélecteur (`@openmasq/catalog`
  // `SIMPLE_MODEL_IDS`) : vérifiées le 02/08/2026 dans le catalogue live, comme
  // l'exige l'avertissement ci-dessus — jamais devinées.
  { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "openrouter", vision: true },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6", provider: "openrouter", vision: true },
  { id: "x-ai/grok-4.20", label: "Grok 4.20", provider: "openrouter", vision: true },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", provider: "openrouter" },
  { id: "qwen/qwen3-vl-32b-instruct", label: "Qwen3 VL 32B", provider: "openrouter", vision: true },
  { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B", provider: "openrouter" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "openrouter" },
  { id: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2", provider: "openrouter", vision: true },
  // Free tier — the strongest no-cost models currently live on OpenRouter (verified
  // present + priced 0/0 in the catalogue). Still gated on the user's own OpenRouter
  // key (a free model is not a platform/credit bypass off-platform).
  // Le DÉFAUT des nouvelles conversations (`prompt/models.ts` `DEFAULT_MODEL_ID`) :
  // gratuit, donc jamais bloqué par `modelAvailability` (« un modèle gratuit ne coûte
  // rien en amont »), donc une installation neuve écrit sans clé ni abonnement.
  // Texte seul, mais outils et raisonnement — vérifié le 02/08/2026 dans le catalogue live.
  { id: "poolside/laguna-s-2.1:free", label: "Laguna S 2.1 (gratuit)", provider: "openrouter" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra (gratuit)", provider: "openrouter" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super (gratuit)", provider: "openrouter" },
  // `noTools`: OpenRouter's Gemma tiers 400 (UPSTREAM_ERROR) on any `tools` request —
  // Gemma has no function calling there. The dynamic catalogue confirms it at runtime
  // (`supported_parameters`); this static mark covers the offline baseline.
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (gratuit)", provider: "openrouter", vision: true, noTools: true },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B (gratuit)", provider: "openrouter", vision: true, noTools: true },
  { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B (gratuit)", provider: "openrouter" },
  { id: "cohere/north-mini-code:free", label: "North Mini Code (gratuit)", provider: "openrouter" },
  { id: "tencent/hy3:free", label: "Tencent Hy3 (gratuit)", provider: "openrouter" },
  { id: "nvidia/nemotron-nano-9b-v2:free", label: "Nemotron Nano 9B (gratuit)", provider: "openrouter" },

  // OpenAI-compatible / local (Ollama defaults)
  { id: "llama3.3", label: "Llama 3.3 (local)", provider: "openai-compat" },
  { id: "llama3.1", label: "Llama 3.1 (local)", provider: "openai-compat" },
  { id: "qwen2.5", label: "Qwen 2.5 (local)", provider: "openai-compat" },
  { id: "qwen2.5-coder", label: "Qwen 2.5 Coder (local)", provider: "openai-compat" },
  { id: "deepseek-r1", label: "DeepSeek-R1 (local)", provider: "openai-compat" },
  { id: "gemma2", label: "Gemma 2 (local)", provider: "openai-compat" },
  { id: "phi4", label: "Phi-4 (local)", provider: "openai-compat" },
  { id: "mistral-nemo", label: "Mistral Nemo (local)", provider: "openai-compat" },

  // Scaleway Generative API — PLATFORM-PROVIDED (the platform's key + prepaid credits,
  // subscription only). OpenAI-compatible; sends route through the backend proxy.
  { id: "glm-5.2", label: "GLM-5.2", provider: "scaleway" },
  { id: "qwen3.5-397b-a17b", label: "Qwen3.5 397B", provider: "scaleway", vision: true },
  { id: "qwen3.6-35b-a3b", label: "Qwen3.6 35B", provider: "scaleway", vision: true },
  { id: "gemma-4-26b-a4b-it", label: "Gemma 4 26B", provider: "scaleway", vision: true },
  { id: "mistral-medium-3.5-128b", label: "Mistral Medium 3.5", provider: "scaleway", vision: true },
  { id: "llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "scaleway" },
  { id: "qwen3-235b-a22b-instruct-2507", label: "Qwen3 235B 2507", provider: "scaleway" },
  { id: "qwen3-coder-30b-a3b-instruct", label: "Qwen3 Coder 30B", provider: "scaleway" },
  { id: "pixtral-12b-2409", label: "Pixtral 12B", provider: "scaleway", vision: true },
  { id: "mistral-small-3.2-24b-instruct-2506", label: "Mistral Small 3.2", provider: "scaleway", vision: true },
  { id: "devstral-2-123b-instruct-2512", label: "Devstral 2 123B", provider: "scaleway" },
  { id: "gpt-oss-120b", label: "GPT-OSS 120B", provider: "scaleway" },
  { id: "gemma-3-27b-it", label: "Gemma 3 27B", provider: "scaleway", vision: true },
  { id: "holo2-30b-a3b", label: "Holo2 30B", provider: "scaleway", vision: true },

  // Keyless web-session models (ChatGPT, Claude, …) are contributed by the
  // extension's session-config package (outside this repo), not listed here.
];

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Snapshot of the STATIC OpenRouter ids, frozen at module init — the ONLY OpenRouter
 *  ids the gateway serves on the platform's key (its `PLATFORM_MODELS` allow-list mirrors
 *  this set; `apps/gateway` `platformModels.test.ts` pins the parity). Captured here
 *  because `setDynamicModels` REPLACES the live OpenRouter entries at runtime — this
 *  snapshot is what "curated" still means afterwards. A dynamically-discovered slug is
 *  BYO-only (`isPlatformServableModel`): routing it to the gateway 400s MODEL_NOT_ALLOWED. */
export const PLATFORM_OPENROUTER_IDS: readonly string[] = Object.freeze(
  MODELS.filter((m) => m.provider === "openrouter").map((m) => m.id),
);
