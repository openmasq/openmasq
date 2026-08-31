/**
 * The `claude -p --output-format stream-json --verbose --include-partial-messages` stream,
 * translated into actions for the UI. Shapes OBSERVED on CLI 2.1.241, not assumed.
 *
 * It's NDJSON whose interesting events wrap the Anthropic SSE:
 *
 *   {"type":"stream_event","event":{"type":"content_block_delta",
 *    "delta":{"type":"text_delta","text":"La"}}, "session_id":"…"}
 *
 * ⚠️ **The duplicate trap.** At the end of a turn, the CLI ALSO emits an event
 * `{"type":"assistant","message":{…content:[{type:"text",text:"<the whole response>"}]}}`
 * that fully REPRODUCES what the `content_block_delta`s just streamed.
 * A parser that reads both displays the response twice. So we only read text from
 * deltas, and `assistant` serves only as a SAFETY NET when partials are absent
 * (`--include-partial-messages` not passed, or a version that doesn't emit them) — hence
 * the `sawDelta` flag carried by the reader.
 */
import type { StreamFinish, TokenUsage } from "@openmasq/llm";
import { cliToolGateMessage, unexpectedCliTools } from "./toolGate";

/** What the engine surfaces. Everything else in the stream is deliberately ignored. */
export type ClaudeAction =
  | { kind: "session"; id: string }
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  | { kind: "rateLimit"; status: string; resetsAt?: number; windowType?: string }
  | { kind: "done"; usage?: TokenUsage; finish: StreamFinish }
  | { kind: "error"; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Anthropic's `input_tokens` EXCLUDES the cache; the `TokenUsage` contract wants
 * `inputTokens` = the FULL prompt, cache included (see the comment in
 * `@openmasq/llm` types.ts). We re-add it here, like the other adapters —
 * without which a working cache would read as a drop in consumption.
 */
export function normalizeUsage(raw: unknown): TokenUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const num = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : 0);
  const cacheRead = num("cache_read_input_tokens");
  const cacheWrite = num("cache_creation_input_tokens");
  const usage: TokenUsage = {
    inputTokens: num("input_tokens") + cacheRead + cacheWrite,
    outputTokens: num("output_tokens"),
  };
  if (cacheRead) usage.cachedInputTokens = cacheRead;
  if (cacheWrite) usage.cacheWriteInputTokens = cacheWrite;
  return usage;
}

/** Anthropic's `stop_reason` → the `StreamFinish` vocabulary of `@openmasq/llm`. */
export function toFinish(stopReason: unknown): StreamFinish {
  if (stopReason === "end_turn" || stopReason === "stop_sequence") return "stop";
  if (stopReason === "max_tokens") return "length";
  return "other";
}

/**
 * An already-parsed NDJSON event → the action to play, or `null` if the event doesn't
 * concern the UI (`system/init`, `system/status`, `message_start`, `content_block_stop`…).
 *
 * `sawDelta`: has the reader ALREADY received at least one `content_block_delta`? If it
 * has, the final `assistant` event is a duplicate and we discard it.
 */
export function interpretClaudeEvent(event: unknown, sawDelta: boolean): ClaudeAction | null {
  if (!isRecord(event)) return null;
  const type = event.type;

  if (type === "stream_event" && isRecord(event.event)) {
    const inner = event.event;
    if (inner.type === "content_block_delta" && isRecord(inner.delta)) {
      const d = inner.delta;
      if (d.type === "text_delta" && typeof d.text === "string") {
        return { kind: "text", delta: d.text };
      }
      if (d.type === "thinking_delta" && typeof d.thinking === "string") {
        return { kind: "reasoning", delta: d.thinking };
      }
      return null;
    }
    return null;
  }

  // Safety net: the full turn, useful ONLY if no delta was passed.
  if (type === "assistant" && !sawDelta && isRecord(event.message)) {
    const content = event.message.content;
    if (!Array.isArray(content)) return null;
    const text = content
      .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === "text")
      .map((b) => (typeof b.text === "string" ? b.text : ""))
      .join("");
    return text ? { kind: "text", delta: text } : null;
  }

  // The SUBSCRIPTION quota (5 h / weekly window), not an API limit. It's the signal
  // to show as-is: "your subscription is exhausted until <resetsAt>", not "error".
  if (type === "rate_limit_event" && isRecord(event.rate_limit_info)) {
    const info = event.rate_limit_info;
    return {
      kind: "rateLimit",
      status: typeof info.status === "string" ? info.status : "unknown",
      resetsAt: typeof info.resetsAt === "number" ? info.resetsAt : undefined,
      windowType: typeof info.rateLimitType === "string" ? info.rateLimitType : undefined,
    };
  }

  // `system/init` ANNOUNCES the turn's tool scope, BEFORE the first call — the
  // only window where a tool the app didn't offer can be REFUSED instead of suffered.
  // An intruder produces an ERROR: `spawnStream` surfaces it and kills the CLI, so the turn
  // fails instead of running with one more capability (rule 7, see `toolGate.ts`).
  if (type === "system" && event.subtype === "init") {
    const unexpected = unexpectedCliTools(event.tools);
    if (unexpected.length) return { kind: "error", message: cliToolGateMessage(unexpected) };
    if (typeof event.session_id === "string") return { kind: "session", id: event.session_id };
    return null;
  }

  if (type === "result") {
    if (event.is_error === true) {
      const msg = typeof event.result === "string" ? event.result : "La CLI a répondu une erreur.";
      return { kind: "error", message: msg };
    }
    return {
      kind: "done",
      usage: normalizeUsage(event.usage),
      finish: toFinish(event.stop_reason),
    };
  }

  return null;
}

/**
 * Splits a byte stream into complete NDJSON lines. `spawn` delivers CHUNKS, not
 * lines: an event of several KB (the `init`, a `message_start`) arrives split in
 * two, and a `JSON.parse` per chunk would silently lose it.
 */
export class NdjsonLineBuffer {
  private buffer = "";

  /** The complete lines contained in this chunk; the remainder is kept. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";
    return parts.map((l) => l.trim()).filter(Boolean);
  }

  /** The final remainder (a last line without `\n`), to handle at close. */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
