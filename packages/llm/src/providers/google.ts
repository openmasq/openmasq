import { readSSE, googleUsage } from "../wire/index.js";
import { retryAfterHint } from "../apiError.js";
import { geminiThinkingFields } from "../reasoning.js";
import type { StreamChatOptions, StreamDone, StreamFinish, TokenUsage } from "../types.js";

export async function* streamGoogle(
  opts: StreamChatOptions,
): AsyncGenerator<string, StreamDone> {
  if (!opts.apiKey) throw new Error("Google Gemini API key is required");

  const system = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      // Gemini multimodal: text part + inlineData (base64) image parts.
      parts: [
        { text: m.content },
        ...(m.attachments?.map((a) => ({
          inlineData: { mimeType: a.mediaType, data: a.dataBase64 },
        })) ?? []),
      ],
    }));

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${opts.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        // Thought SUMMARIES, only when someone is listening and the model has a
        // thinking stage (2.5+). They arrive as parts flagged `thought: true`.
        ...geminiThinkingFields(opts.model, !!opts.onReasoning),
      },
    }),
  });

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Gemini API error ${res.status}${retryAfterHint(res, body)}: ${body}`);
  }

  let usage: TokenUsage | undefined;
  let finishReason: string | undefined; // Gemini's `finishReason` (last chunk)
  let sawDone = false; // some proxies append an OpenAI-style `[DONE]` sentinel
  for await (const data of readSSE(res, opts.signal)) {
    if (data === "[DONE]") {
      sawDone = true;
      break;
    }
    try {
      const json = JSON.parse(data);
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text !== "string") continue;
        // ⚠️ A thought part carries `text` like any other — checked FIRST and never
        // yielded, or the model's reasoning would be pasted into the answer as if it
        // were the reply (the whole reason this branch exists before the yield).
        if (part.thought === true) opts.onReasoning?.(part.text);
        else yield part.text;
      }
      // finishReason lands on the LAST chunk ("STOP" | "MAX_TOKENS" | "SAFETY" | …).
      const fr = json.candidates?.[0]?.finishReason;
      if (typeof fr === "string") finishReason = fr;
      // usageMetadata is repeated on each chunk; the last one is cumulative.
      usage = googleUsage(json.usageMetadata) ?? usage;
    } catch {
      // ignore non-JSON lines
    }
  }
  // Normalise like the OpenAI/Anthropic paths: `MAX_TOKENS` = TRUNCATED (`length`);
  // a stream that ends with NO finishReason at all means it DROPPED mid-reply
  // (`cut`) — the caller must be able to flag the answer incomplete instead of
  // presenting a truncated reply as "done".
  const finish: StreamFinish =
    finishReason === "MAX_TOKENS"
      ? "length"
      : finishReason === "STOP" || (sawDone && !finishReason)
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
