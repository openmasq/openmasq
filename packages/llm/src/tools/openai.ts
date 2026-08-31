import { readSSE, openaiUsage } from "../wire/index.js";
import { providerCreditsExhausted, rateLimitInfo, rateLimitLeft, toolRequestError } from "../apiError.js";
import { omitsTemperature } from "../models/index.js";
import { promptCacheKey } from "../promptCache.js";
import { deltaReasoning, openAiReasoningFields, reasoningFallback } from "../reasoning.js";
import { parseArgs } from "./parseArgs.js";
import type {
  ChatMessage,
  CompleteToolsOptions,
  CompleteToolsResult,
  ToolCall,
  TokenUsage,
} from "../types.js";

/** Translate our agentic messages into OpenAI/Mistral chat-completions shape. */
function toOpenAIMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      };
    }
    if (m.role === "assistant") {
      // Mistral (unlike OpenAI) rejects an assistant message with neither content
      // nor tool_calls (code 3240). An empty/whitespace assistant turn can reach
      // here from history (an interrupted, errored or empty prior reply — e.g. the
      // blank bubble a failed send leaves behind). Coerce it to a NON-whitespace
      // placeholder: a single space is trimmed to empty server-side and still 400s.
      return { role: "assistant", content: m.content?.trim() ? m.content : "…" };
    }
    // A user turn may carry image attachments (a redacted document sent as page
    // images). Expand them into multimodal parts exactly like the plain-stream path
    // (providers/openai.ts) — without this the agentic/tools path silently dropped the
    // images, so a document sent to a model WITH an MCP connector never reached it.
    if (m.attachments?.length) {
      return {
        role: m.role,
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.attachments.map((a) => ({
            type: "image_url",
            image_url: { url: `data:${a.mediaType};base64,${a.dataBase64}` },
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

const STOP: Record<string, CompleteToolsResult["stopReason"]> = {
  tool_calls: "tool_calls",
  stop: "stop",
  length: "length",
};

// Transient statuses worth retrying: rate limits (429 — common on Mistral's free
// tier) and upstream hiccups. Everything else fails fast.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
// …but a retryable STATUS can still carry a PERMANENT error. When the platform's gateway
// has no provider key set it 502s the SAME way on every attempt ("…API_KEY is not set
// — cannot reach the … inference …"), so retrying just makes the user sit through the
// full backoff (~30-60s of "rédige la réponse…") for something that can never clear.
// Detect that class from the body and fail fast instead. Matched on the gateway's own
// wording, kept broad enough to cover each provider key (GEMINI/ANTHROPIC/GPTOSS…).
const PERMANENT_UPSTREAM_ERROR = /\bis not set\b|not configured|cannot reach the [\w -]*inference/i;
// The gateway BOUNDS a thrown-upstream failure to `{"error":"UPSTREAM_UNAVAILABLE"}` —
// deliberately message-free (an unset provider key must not leak its env-var name), so
// the wording above never reaches the client for THAT class anymore. It covers both a
// permanent misconfiguration AND a genuine blip, indistinguishably — so allow ONE quick
// retry, then surface: the old full backoff meant ~30-60s of silent « rédige la
// réponse… » on a gateway that 502s identically forever (the invisible-error bug).
const BOUNDED_UPSTREAM_UNAVAILABLE = /\bUPSTREAM_UNAVAILABLE\b/;
const BOUNDED_UNAVAILABLE_MAX_RETRIES = 1;
// Mistral's tier 429s aggressively and the agentic loop fires several calls in a
// row (decide → tool → summarise), so be patient: ~0.5+1+2+4+8+16s ≈ 31s of
// abortable backoff before surfacing a rate-limit banner. Stop cancels the wait.
const MAX_TOOL_RETRIES = 6;

/** How long to wait before retrying — honour `Retry-After` (seconds or HTTP date)
 *  when present, else exponential backoff with jitter, capped. */
function retryDelayMs(res: Response, attempt: number): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 30_000);
    const at = Date.parse(ra);
    if (!Number.isNaN(at)) return Math.max(0, Math.min(at - Date.now(), 30_000));
  }
  return Math.min(500 * 2 ** attempt + Math.random() * 250, 20_000);
}

/** Abortable sleep — rejects with an AbortError if the signal fires. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Non-streaming chat completion with tool-calling for OpenAI, Mistral and any
 * OpenAI-compatible endpoint. Returns the assistant text plus the tools the
 * model wants to run this turn. Retries transient 429/5xx with backoff.
 */
/** Human label for errors — this path is shared by OpenAI, Mistral and any
 *  OpenAI-compatible endpoint, so name the ACTUAL provider (not always "OpenAI"). */
const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  "openai-compat": "OpenAI-compatible",
};

/** The JSON request body shared by the streaming + non-streaming tool paths. */
function toolsBody(opts: CompleteToolsOptions, stream: boolean): string {
  // Prompt-cache routing hint (OpenAI + Mistral only). Includes the tool NAMES so a
  // change to the offered tool set (routing/`load_tools`) buckets separately — matching
  // when the cached prefix actually stays valid. Stable across an agentic loop's turns.
  const cacheKey = promptCacheKey(
    opts.provider,
    opts.model,
    opts.messages,
    opts.tools?.map((t) => t.name),
  );
  return JSON.stringify({
    model: opts.model,
    ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
    // OpenRouter `:free`: request the backend at the best THROUGHPUT — the default
    // routing (price) settles nothing at €0, and the :free queues' latency is the
    // measured pain (turns at 45-420s). Paying models keep the default.
    ...(opts.provider === "openrouter" && opts.model.endsWith(":free")
      ? { provider: { sort: "throughput" } }
      : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    ...openAiReasoningFields(opts.provider, !!opts.onReasoning),
    // GPT-5.x / o-series reasoning models reject a custom temperature.
    ...(omitsTemperature(opts.model) ? {} : { temperature: opts.temperature ?? 0.7 }),
    messages: toOpenAIMessages(opts.messages),
    ...(opts.tools?.length
      ? {
          tools: opts.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          tool_choice: opts.toolChoice === "required" ? "required" : "auto",
        }
      : {}),
  });
}

/** POST the completions request, retrying a transient 429/5xx (with backoff) on
 *  the INITIAL response — shared by both paths (streaming can only retry before
 *  the body starts). Throws a labelled error once retries are exhausted. */
async function postTools(
  opts: CompleteToolsOptions,
  defaultBaseUrl: string,
  stream: boolean,
): Promise<Response> {
  const label = PROVIDER_LABEL[opts.provider] ?? opts.provider;
  const baseUrl = (opts.baseUrl || defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;
  const body = toolsBody(opts, stream);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      signal: opts.signal,
      body,
    });
    if (res.ok) return res;
    // Read the body ONCE — it drains the socket for reuse AND lets us tell a transient
    // 5xx (worth a backoff) from a permanent one (a gateway with no provider key, which
    // 502s identically forever). Retrying the permanent case is pure dead time.
    const text = await res.text().catch(() => "");
    const retryCap = BOUNDED_UPSTREAM_UNAVAILABLE.test(text)
      ? BOUNDED_UNAVAILABLE_MAX_RETRIES
      : MAX_TOOL_RETRIES;
    // Neither a spent PERIODIC quota (`rateLimitInfo`) nor a no-credits account
    // (`providerCreditsExhausted` — insufficient_quota wears a 429) is a burst: retrying is dead time.
    const rl = res.status === 429 ? rateLimitInfo(text) : null;
    if (
      RETRYABLE_STATUS.has(res.status) &&
      attempt < retryCap &&
      !rl?.daily && !providerCreditsExhausted(text) &&
      !PERMANENT_UPSTREAM_ERROR.test(text)
    ) {
      await sleep(retryDelayMs(res, attempt), opts.signal);
      continue;
    }
    throw toolRequestError(label, res, text, attempt);
  }
}

export async function completeOpenAITools(
  opts: CompleteToolsOptions,
  defaultBaseUrl: string,
): Promise<CompleteToolsResult> {
  const res = await postTools(opts, defaultBaseUrl, false);

  const json = await res.json();
  const choice = json.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map(
    (tc: { id: string; function: { name: string; arguments: string } }) => {
      const { args, error } = parseArgs(tc.function.arguments);
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args,
        ...(error ? { argsError: error } : {}),
      };
    },
  );

  // Same reasoning-model fallback as the streaming path: if the model returned no `content`
  // and no tool call but DID reason, surface the reasoning so the turn isn't a silent void.
  const content = typeof message.content === "string" ? message.content : "";
  const text =
    content || (toolCalls.length === 0 ? reasoningFallback(deltaReasoning(message) ?? "") : "");

  const left = rateLimitLeft(res.headers);
  return {
    text,
    toolCalls,
    stopReason: STOP[choice.finish_reason as string] ?? "other",
    usage: openaiUsage(json.usage),
    ...(left ? { rateLimit: left } : {}),
  };
}

/**
 * STREAMING chat completion with tool-calling for OpenAI / Mistral / Scaleway and
 * any OpenAI-compatible endpoint. YIELDS assistant text deltas as they arrive (so
 * the final answer streams token-by-token instead of arriving as one blob) and
 * RETURNS the assembled turn (text + tool calls + usage). Tool-call fragments are
 * streamed across chunks (`delta.tool_calls[].function.arguments` comes in pieces)
 * and reassembled by their `index`. Same request/retry shape as the non-streaming
 * path — a transient 429/5xx is retried before the stream begins.
 */
export async function* streamOpenAITools(
  opts: CompleteToolsOptions,
  defaultBaseUrl: string,
): AsyncGenerator<string, CompleteToolsResult> {
  const res = await postTools(opts, defaultBaseUrl, true);

  // Reassemble tool calls streamed as fragments, keyed by their `index`.
  const byIndex = new Map<number, { id: string; name: string; args: string }>();
  let text = "";
  // A reasoning model can stream its whole turn as `reasoning_content` with an EMPTY
  // `content` — accumulate it so a reasoning-only turn isn't a silent "no response".
  let reasoning = "";
  let finishReason: string | undefined;
  let usage: TokenUsage | undefined;
  // Throttled progress of the tool-call arguments' running length — a big argument
  // (a full HTML file) streams for seconds with no assistant text, so this is the
  // only live signal of that work. Only report every ~128 chars to bound traffic.
  let argsLen = 0;
  let reportedArgsLen = 0;

  for await (const data of readSSE(res, opts.signal)) {
    if (data === "[DONE]") break;
    let json: {
      choices?: { delta?: { content?: string; tool_calls?: unknown[] }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    try {
      json = JSON.parse(data);
    } catch {
      continue; // keep-alive / non-JSON line
    }
    const choice = json.choices?.[0];
    const delta = choice?.delta;
    if (delta?.content) {
      text += delta.content;
      yield delta.content;
    }
    const rc = deltaReasoning(delta);
    if (rc) reasoning += rc; // …the fallback's buffer…
    if (rc) opts.onReasoning?.(rc); // …and the live reflection: one text, never two copies
    if (Array.isArray(delta?.tool_calls)) {
      for (const raw of delta.tool_calls) {
        const tc = raw as { index?: number; id?: string; function?: { name?: string; arguments?: string } };
        const idx = typeof tc.index === "number" ? tc.index : 0;
        const acc = byIndex.get(idx) ?? { id: "", name: "", args: "" };
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (typeof tc.function?.arguments === "string") {
          acc.args += tc.function.arguments;
          argsLen += tc.function.arguments.length;
        }
        byIndex.set(idx, acc);
      }
      if (opts.onToolArgs && argsLen - reportedArgsLen >= 128) {
        reportedArgsLen = argsLen;
        // The tool NAME streams before its arguments, so it's already known — pass it so
        // the UI can name the action concretely (not a generic "action…"). Last-named
        // call wins (the one whose args are currently growing; single-tool is the norm).
        const named = [...byIndex.values()].map((a) => a.name).filter(Boolean);
        opts.onToolArgs(argsLen, named[named.length - 1]);
      }
    }
    if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    usage = openaiUsage(json.usage) ?? usage;
  }

  const toolCalls: ToolCall[] = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, acc]) => {
      const { args, error } = parseArgs(acc.args);
      return { id: acc.id, name: acc.name, arguments: args, ...(error ? { argsError: error } : {}) };
    });

  // The model produced NOTHING usable (no answer text, no tool call) but DID stream
  // reasoning — a reasoning model whose whole turn landed in `reasoning_content` with an
  // empty `content`. Surface that reasoning as the answer so the turn isn't a silent void
  // ("Le modèle n'a renvoyé aucune réponse"). Yield it too so it lands in the live bubble.
  if (!text && toolCalls.length === 0) {
    const r = reasoningFallback(reasoning);
    if (r) {
      yield r;
      text = r;
    }
  }

  const left = rateLimitLeft(res.headers);
  return {
    text,
    toolCalls,
    stopReason: STOP[finishReason as string] ?? (toolCalls.length ? "tool_calls" : "other"),
    usage,
    ...(left ? { rateLimit: left } : {}),
  };
}
