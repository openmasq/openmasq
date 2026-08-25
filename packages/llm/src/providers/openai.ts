import { readSSE, openaiUsage } from "../wire/index.js";
import { retryAfterHint } from "../apiError.js";
import { omitsTemperature } from "../models/index.js";
import { promptCacheKey } from "../promptCache.js";
import { deltaReasoning, openAiReasoningFields, reasoningFallback } from "../reasoning.js";
import type {
  ChatMessage,
  StreamChatOptions,
  StreamDone,
  StreamFinish,
  TokenUsage,
} from "../types.js";

/** Expand a message's image attachments into OpenAI multimodal content parts
 *  (`image_url` data URIs). Text-only messages pass through unchanged. */
function toOpenAiMessage(m: ChatMessage): unknown {
  if (!m.attachments?.length) return m; // text-only → unchanged (preserves prior behaviour)
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

/**
 * Works for both OpenAI and any OpenAI-compatible endpoint (Ollama, LM Studio,
 * Together, Groq, …) — the only difference is the base URL and whether an API
 * key is required. Returns token usage when the endpoint reports it (OpenAI does
 * with `stream_options.include_usage`; some compatibles omit it → undefined).
 */
export async function* streamOpenAI(
  opts: StreamChatOptions,
  defaultBaseUrl: string,
): AsyncGenerator<string, StreamDone> {
  const baseUrl = (opts.baseUrl || defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  // Prompt-cache routing hint (OpenAI + Mistral only). Stable per conversation so
  // repeated sends land on the same warm node → the shared prefix cache hits.
  const cacheKey = promptCacheKey(opts.provider, opts.model, opts.messages);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      stream_options: { include_usage: true },
      ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
      // OpenRouter withholds the reflection unless asked; the other compatibles either
      // stream it unprompted or have none. No listener ⇒ no field (see `reasoning.ts`).
      ...openAiReasoningFields(opts.provider, !!opts.onReasoning),
      // GPT-5.x / o-series reasoning models reject a custom temperature.
      ...(omitsTemperature(opts.model) ? {} : { temperature: opts.temperature ?? 0.7 }),
      messages: opts.messages.map(toOpenAiMessage),
    }),
  });

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`OpenAI API error ${res.status}${retryAfterHint(res, body)}: ${body}`);
  }

  let usage: TokenUsage | undefined;
  let finishReason: string | undefined; // provider's last `finish_reason`
  let sawDone = false; // did the stream end cleanly (`[DONE]`)?
  let yielded = false; // did any real `content` reach the caller?
  // A reasoning model can stream its whole turn as `reasoning_content`/`reasoning` with an
  // EMPTY `content` — accumulate it as a fallback so the reply isn't a silent void.
  let reasoning = "";
  for await (const data of readSSE(res, opts.signal)) {
    if (data === "[DONE]") {
      sawDone = true;
      break;
    }
    try {
      const json = JSON.parse(data);
      const delta: string | undefined = json.choices?.[0]?.delta?.content;
      if (delta) {
        yielded = true;
        yield delta;
      }
      const rc = deltaReasoning(json.choices?.[0]?.delta);
      if (rc) {
        reasoning += rc;
        // Live: the caller renders the reflection instead of a bare loader. It is the
        // SAME text the fallback below may promote to the answer — never a second copy.
        opts.onReasoning?.(rc);
      }
      // finish_reason lands on the last content chunk ("stop" | "length" | …).
      const fr = json.choices?.[0]?.finish_reason;
      if (typeof fr === "string") finishReason = fr;
      // The usage chunk (sent after the last content chunk) has an empty
      // `choices` array; compatibles that don't support it simply never send it.
      usage = openaiUsage(json.usage) ?? usage;
    } catch {
      // ignore keep-alive / non-JSON lines
    }
  }
  // Reasoning-only turn (no `content` streamed) → surface the reasoning so the user gets
  // the model's output instead of an empty bubble.
  if (!yielded && reasoning) {
    const r = reasoningFallback(reasoning);
    if (r) yield r;
  }
  // Normalise: a `length` cap or a stream that dropped without a clean end (no
  // `[DONE]` and no `stop`) means the answer is TRUNCATED — the caller flags it.
  const finish: StreamFinish =
    finishReason === "length"
      ? "length"
      : finishReason === "stop" || sawDone
        ? "stop"
        : finishReason
          ? "other"
          : "cut";
  return { usage, finish };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}
