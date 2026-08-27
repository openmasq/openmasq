export type Role = "system" | "user" | "assistant" | "tool";

/** A binary part attached to a message (an image today — e.g. a redacted document
 *  page). Sent to vision-capable models as a native image block. `dataBase64` is
 *  the raw base64 (no `data:` prefix); `mediaType` is the MIME (image/png…). */
export interface LlmAttachment {
  kind: "image";
  mediaType: string;
  dataBase64: string;
}

export interface ChatMessage {
  role: Role;
  content: string;
  /** Image parts attached to this (user) turn — serialised into provider-native
   *  multimodal content. Requires a `vision` model (callers gate on it). */
  attachments?: LlmAttachment[];
  /** Set on an assistant turn that decided to call tools (agentic loop). */
  toolCalls?: ToolCall[];
  /** Set on a `role: "tool"` turn: which assistant tool call this answers. */
  toolCallId?: string;
}

/** A tool the model may call, provider-neutral (JSON-Schema arguments). */
export interface ToolDef {
  name: string;
  description?: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
}

/** A tool invocation the model produced. `arguments` is already JSON-parsed. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /**
   * Set when the model's raw `arguments` string was NOT valid JSON. Providers
   * that hand back a JSON STRING (the OpenAI-compatible path — OpenAI/Mistral/
   * Scaleway) can't parse a malformed call; instead of silently degrading to `{}`
   * (the model then never learns its JSON was broken), they surface the parse
   * error here so the caller can feed it back and let the model self-correct.
   * Absent = parsed cleanly. Never present on providers that return native objects
   * (Anthropic/Google).
   */
  argsError?: string;
  /**
   * Opaque provider token that MUST be echoed back on the next turn. Gemini 3+
   * returns a `thoughtSignature` on each functionCall part and 400s if the call
   * is replayed in history without it ("missing thought_signature in functionCall
   * parts"). Round-tripped verbatim via the assistant message's `toolCalls`.
   * Provider-specific (Google today); absent for others.
   */
  thoughtSignature?: string;
}

export interface CompleteToolsOptions {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  /** Tools offered to the model this turn. */
  tools?: ToolDef[];
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  /** Cap on output tokens (Anthropic requires it; default 4096). */
  maxTokens?: number;
  /** Force the model to emit a tool call this turn (`"required"`) instead of the
   *  default `"auto"` — used to make a weak model that declined in prose actually
   *  act. Mapped per provider (OpenAI `required`, Anthropic `{type:"any"}`,
   *  Google `mode:"ANY"`). */
  toolChoice?: "auto" | "required";
  signal?: AbortSignal;
  /** Progress hook for STREAMING tool turns: the running total character count of
   *  the tool-call arguments the model has emitted so far, PLUS the name of the tool
   *  being called (known early — it streams before the arguments). A large `write_file`
   *  argument (a full HTML doc) streams for seconds with no assistant text, so this is
   *  the only live signal of that work — surfaced in the desktop Debug Log AND the chat
   *  bubble's "thinking" indicator (as a concrete action). Throttled by the caller
   *  (`streamOpenAITools`); a no-op on non-streaming paths. */
  onToolArgs?: (chars: number, name?: string) => void;
  /** The model's REFLECTION, streamed delta by delta while it is being produced —
   *  the chain of thought a reasoning model emits on a SEPARATE channel from its
   *  answer (`reasoning_content`/`reasoning`, Anthropic `thinking_delta`, Gemini
   *  `thought` parts). Surfaced in the chat bubble in place of a bare loader.
   *
   *  ⚠️ Its PRESENCE is also the request-side switch: providers that only reason
   *  when ASKED (Anthropic `thinking`, Gemini `thinkingConfig`, OpenRouter
   *  `reasoning`) are asked ONLY when a caller is listening — so a caller that
   *  doesn't pass it (redaction, evals, the gateway) keeps the exact request, cost
   *  and latency it had before. */
  onReasoning?: (delta: string) => void;
}

/** Token accounting for one model call (input = prompt, output = completion).
 *
 *  ⚠️ **`inputTokens` est TOUJOURS le prompt COMPLET, cache inclus.** Les deux familles
 *  de providers ne comptent pas pareil et la normalisation se fait à la lecture, pas
 *  ici : OpenAI/OpenRouter incluent déjà le cache dans `prompt_tokens`, alors
 *  qu'Anthropic le SORT (`input_tokens` = les seuls tokens facturés plein tarif, à
 *  côté de `cache_read_input_tokens` / `cache_creation_input_tokens`). Un lecteur
 *  Anthropic qui recopie `input_tokens` tel quel fait donc CHUTER le total dès que le
 *  cache marche — et on lit « moins cher » là où il faut lire « bien mis en cache ».
 *  Chaque adaptateur ré-additionne, de sorte que `cachedInputTokens` est partout une
 *  PART de `inputTokens`. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Part de `inputTokens` servie depuis le CACHE du provider (OpenAI/OpenRouter
   *  `prompt_tokens_details.cached_tokens`, Anthropic `cache_read_input_tokens`) — la
   *  mesure d'efficacité du préfixe stable (tri des outils + `prompt_cache_key` /
   *  `cache_control`). Facturée ≈0,1× l'entrée. Absent quand non rapporté. */
  cachedInputTokens?: number;
  /** Part de `inputTokens` ÉCRITE dans le cache par cet appel (Anthropic
   *  `cache_creation_input_tokens`) — facturée ~1,25× l'entrée, et donc le coût
   *  d'amorçage qu'un point de rupture doit rentabiliser sur les tours suivants.
   *  Sans lui, un cache qui se ré-amorce à chaque tour (préfixe instable) se lit
   *  comme un cache absent alors qu'il coûte PLUS cher que pas de cache du tout.
   *  Non rapporté par OpenAI (l'écriture y est implicite et gratuite). */
  cacheWriteInputTokens?: number;
}

/** Why a streamed completion ended. `length` = hit the max-tokens cap; `cut` =
 *  the stream dropped without a clean end (no `[DONE]`/finish) — both mean the
 *  answer is TRUNCATED. `stop` = finished normally. */
export type StreamFinish = "stop" | "length" | "cut" | "other";

/** The RETURN value of `streamChat` — usage (when reported) + why it ended, so the
 *  caller can flag a truncated reply as incomplete instead of treating it as done. */
export interface StreamDone {
  usage?: TokenUsage;
  finish?: StreamFinish;
}

/** One non-streaming agentic turn: any assistant text plus the tools it called. */
export interface CompleteToolsResult {
  text: string;
  toolCalls: ToolCall[];
  /** Provider stop reason, normalised: "tool_calls" when tools were requested. */
  stopReason: "tool_calls" | "stop" | "length" | "other";
  /** Token usage for this turn, when the provider reports it. */
  usage?: TokenUsage;
  /**
   * The provider's remaining REQUEST quota after this call, when its headers state one.
   * Numbers only — no content, so it is safe to surface to the user. It exists so a cap
   * can be ANNOUNCED while there is still room to act: the counter rides every reply,
   * and reading it only on the refusal is how a daily quota came as a surprise.
   */
  rateLimit?: { remaining: number; limit?: number; resetAt?: number };
}

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "deepseek"
  | "openrouter"
  | "scaleway"
  | "openai-compat"
  | "openai-session"
  | "anthropic-session"
  /** L'abonnement Claude de l'utilisateur, servi par SA CLI Claude Code installée
   *  (headless, moteur desktop `apps/desktop/src/main/subscription/`) — jamais par
   *  ce client HTTP : ni clé, ni endpoint, l'auth reste dans la CLI. */
  | "claude-cli"
  /** L'abonnement ChatGPT de l'utilisateur, servi par SA CLI Codex installée
   *  (headless, même moteur desktop `subscription/`) — ni clé, ni endpoint ici. */
  | "codex-cli";

/**
 * Where a provider's inference is HOSTED — shown as a small flag next to each model
 * so the (privacy-first) user can see the data-residency jurisdiction at a glance.
 * `code` drives the UI glyph: `US`/`FR`/`CN` = a country flag, `local` = runs on the
 * user's own machine (Ollama/openai-compat), `global` = a multi-region gateway whose
 * inference location isn't a single country (OpenRouter). Keep it HONEST — omit
 * `hostCountry` rather than assert a jurisdiction we can't stand behind.
 */
export type HostCode = "US" | "FR" | "CN" | "local" | "global";
export interface HostCountry {
  code: HostCode;
  /** FR tooltip, e.g. "Hébergé aux États-Unis". */
  label: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Where the user obtains an API key (shown in settings). */
  keyUrl?: string;
  /** Whether a custom base URL is expected (e.g. local Ollama). */
  customBaseUrl?: boolean;
  /** Default base URL for openai-compatible providers. */
  defaultBaseUrl?: string;
  /**
   * "Keyless" providers authenticate with an interactive web login instead of
   * an API key. Handled entirely by the desktop main process.
   */
  keyless?: boolean;
  /** Inference hosting jurisdiction (data residency) — shown as a flag in pickers. */
  hostCountry?: HostCountry;
}

export interface ModelInfo {
  /** Provider-specific model id sent to the API. */
  id: string;
  /** Human friendly label shown in the UI. */
  label: string;
  provider: ProviderId;
  /** The model accepts image inputs (so a redacted document can be sent as page
   *  images instead of extracted text). Absent/false ⇒ text-only. */
  vision?: boolean;
  /** The model CANNOT do tool/function calling — a `tools` request 400s upstream
   *  (OpenRouter's Gemma tiers). Absent/false ⇒ assumed capable. Dynamic OpenRouter
   *  entries set it from the catalogue's `supported_parameters`; the agent loop
   *  (`supportsTools`) falls back to a plain stream for these. */
  noTools?: boolean;
}

export interface StreamChatOptions {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  /** Override base URL (openai-compatible / self-hosted). */
  baseUrl?: string;
  temperature?: number;
  signal?: AbortSignal;
  /** The model's REFLECTION, streamed as it is produced — the separate channel a
   *  reasoning model fills before (and between) its answer tokens. See
   *  {@link CompleteToolsOptions.onReasoning}: same contract, same double role. */
  onReasoning?: (delta: string) => void;
}
