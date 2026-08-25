import { readSSE } from "../wire/index.js";
import { retryAfterHint } from "../apiError.js";
import { anthropicEndpoint } from "./anthropicEndpoint.js";
import { anthropicUsage } from "../wire/index.js";
import { anthropicThinkingFields } from "../reasoning.js";
import type { StreamChatOptions, StreamDone, StreamFinish, TokenUsage } from "../types.js";

export async function* streamAnthropic(
  opts: StreamChatOptions,
): AsyncGenerator<string, StreamDone> {
  // apiKey is the user's Anthropic key (direct) OR the Supabase JWT (platform, when
  // baseUrl points at the platform's gateway). Either way it must be present.
  if (!opts.apiKey) throw new Error("Anthropic API key is required");

  // Anthropic takes the system prompt as a top-level field, not a message.
  const system = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const messages = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) =>
      m.attachments?.length
        ? {
            role: m.role,
            // Anthropic multimodal: an array of text + image blocks. A whitespace-only
            // text block is REJECTED (400 "text content blocks must be non-empty"), so it
            // is emitted only when there's real text (mirrors tools/anthropic.ts).
            content: [
              ...(m.content?.trim() ? [{ type: "text", text: m.content }] : []),
              ...m.attachments.map((a) => ({
                type: "image",
                source: { type: "base64", media_type: a.mediaType, data: a.dataBase64 },
              })),
            ],
          }
        : { role: m.role, content: m.content },
    );

  // DIRECT (user key → api.anthropic.com) vs PLATFORM (Supabase JWT → platform gateway
  // `${baseUrl}/v1/messages`, which holds the platform's key). See `anthropicEndpoint`.
  const { url, headers } = anthropicEndpoint(opts.apiKey, opts.baseUrl);
  // Claude only reflects when ASKED, and only reports readable text with
  // `display:"summarized"` — plus the raised cap thinking + answer now share.
  const thinking = anthropicThinkingFields(opts.model, !!opts.onReasoning);
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: thinking.maxTokens,
      stream: true,
      ...thinking.fields,
      // `temperature` is intentionally NOT sent: the current Claude models
      // (opus-4-8 / sonnet-4-6 / haiku-4-5) DEPRECATED it and return 400 if it's
      // present — even the redaction path's temperature:0. Anthropic's default is used.
      // PROMPT CACHING on the system prompt (reused across a conversation's turns) —
      // a cache read is ≈0.1× input cost + faster TTFT. No-op below the model's cache
      // minimum, never an error. GA on anthropic-version 2023-06-01.
      ...(system
        ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] }
        : {}),
      messages,
    }),
  });

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Anthropic API error ${res.status}${retryAfterHint(res, body)}: ${body}`);
  }

  // input_tokens + the CACHE counts arrive on message_start; output_tokens accumulate on
  // message_delta (final value is the cumulative completion count). `anthropicUsage`
  // folds the cache read/write back into `inputTokens` — Anthropic reports them apart.
  let startUsage: TokenUsage | undefined;
  let outputTokens = 0;
  let stopReason: string | undefined; // Anthropic's native stop_reason (message_delta)
  let sawStop = false; // did the stream end cleanly (`message_stop`)?
  for await (const data of readSSE(res, opts.signal)) {
    try {
      const json = JSON.parse(data);
      if (
        json.type === "content_block_delta" &&
        json.delta?.type === "text_delta"
      ) {
        yield json.delta.text as string;
      } else if (
        json.type === "content_block_delta" &&
        json.delta?.type === "thinking_delta" &&
        typeof json.delta.thinking === "string"
      ) {
        // The reflection rides its OWN block type — it must never be yielded as answer
        // text (it is a summary of the reasoning, not the reply).
        opts.onReasoning?.(json.delta.thinking);
      } else if (json.type === "message_start") {
        startUsage = anthropicUsage(json.message?.usage) ?? startUsage;
        outputTokens = startUsage?.outputTokens ?? outputTokens;
      } else if (json.type === "message_delta") {
        outputTokens = json.usage?.output_tokens ?? outputTokens;
        if (typeof json.delta?.stop_reason === "string") stopReason = json.delta.stop_reason;
      } else if (json.type === "message_stop") {
        sawStop = true;
        break;
      } else if (json.type === "error") {
        throw new Error(json.error?.message ?? "Anthropic stream error");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Anthropic")) throw err;
      // ignore non-JSON keep-alives
    }
  }
  const usage: TokenUsage | undefined =
    startUsage || outputTokens
      ? { ...(startUsage ?? { inputTokens: 0, outputTokens: 0 }), outputTokens }
      : undefined;
  // Normalise like the OpenAI path: `max_tokens` = TRUNCATED (`length`); a stream
  // that ends before `message_stop` AND before any stop_reason means it DROPPED
  // (`cut`) — the gateway masks an upstream failure as a clean end, so the caller
  // must be able to flag the reply incomplete instead of "done".
  const finish: StreamFinish =
    stopReason === "max_tokens"
      ? "length"
      : sawStop || stopReason === "end_turn" || stopReason === "stop_sequence"
        ? "stop"
        : stopReason
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
