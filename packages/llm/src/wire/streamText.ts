import { sseJsonEvents } from "./sse.js";

/**
 * Reading the TEXT back out of a stream a proxy already relayed — the input to a
 * best-effort token ESTIMATE when the authoritative usage chunk never arrived
 * (a client that aborted the SSE one frame early must still be metered).
 *
 * Shares `sseJsonEvents` with the usage parsers on purpose: an estimate that scanned
 * frames differently from the counter it stands in for would be a second, quieter
 * answer to the same question.
 */

/** Assistant text streamed over an OpenAI-compatible SSE buffer (`delta.content`). */
export function openaiStreamedText(sseText: string): string {
  let out = "";
  for (const evt of sseJsonEvents<{ choices?: { delta?: { content?: unknown } }[] }>(sseText)) {
    for (const c of evt?.choices ?? []) {
      if (typeof c.delta?.content === "string") out += c.delta.content;
    }
  }
  return out;
}

/** Assistant text streamed over an Anthropic SSE buffer (`content_block_delta`). */
export function anthropicStreamedText(sseText: string): string {
  let out = "";
  for (const evt of sseJsonEvents<{ type?: string; delta?: { type?: string; text?: unknown } }>(sseText)) {
    if (evt?.type === "content_block_delta" && evt.delta?.type === "text_delta" && typeof evt.delta.text === "string") {
      out += evt.delta.text;
    }
  }
  return out;
}

/** Flatten an OpenAI-compatible request body (`messages[].content`, string or part
 *  array) into one string, for an INPUT-token estimate. */
export function openaiPromptText(body: unknown): string {
  const messages = Array.isArray((body as { messages?: unknown })?.messages)
    ? (body as { messages: unknown[] }).messages
    : [];
  let s = "";
  for (const m of messages) s += contentText((m as { content?: unknown })?.content);
  return s;
}

/** Flatten a native Anthropic request body (top-level `system` + `messages[].content`)
 *  into one string, for an INPUT-token estimate. */
export function anthropicPromptText(body: unknown): string {
  const b = body as { system?: unknown; messages?: unknown[] };
  let s = contentText(b?.system);
  for (const m of Array.isArray(b?.messages) ? b.messages : []) {
    s += contentText((m as { content?: unknown })?.content);
  }
  return s;
}

/** A message/system `content` — a plain string or a block array — as text. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content + "\n";
  if (!Array.isArray(content)) return "";
  let s = "";
  for (const part of content) {
    const txt = (part as { text?: unknown })?.text;
    if (typeof txt === "string") s += txt + "\n";
  }
  return s;
}

/** Chars-per-token used by every estimate. Rough on purpose — an estimate is a floor
 *  against escaping the meter, never a bill; it is tagged `estimated` wherever it lands. */
export const CHARS_PER_TOKEN = 4;

/** ~tokens for a string (chars/4, rounded up; 0 for empty). */
export function estimateTokens(text: string): number {
  return text.length > 0 ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}
