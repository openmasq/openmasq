/**
 * Interpreter for the `codex exec --json` stream (JSONL) → engine actions. Pure, tested.
 *
 * Vocabulary MEASURED on 26/08/2026 against CLI 0.149.1 (real captures):
 * - `{type:"thread.started", thread_id}` — the session.
 * - `{type:"turn.started"}` — ignored.
 * - `{type:"item.started"|"item.completed", item:{type, …}}` where `item.type` is
 *   `agent_message` (the TEXT, `text` field), `command_execution`, `web_search`,
 *   `reasoning`… The text arrives on `item.completed` only: 0.149.1 emits
 *   NO delta (measured: 16 s of silence then 2,213 characters all at once), so no
 *   duplicate is possible — but no token-by-token streaming either.
 * - `{type:"turn.completed", usage:{input_tokens, cached_input_tokens,
 *   cache_write_input_tokens, output_tokens, reasoning_output_tokens}}` — OpenAI
 *   semantics: `input_tokens` already INCLUDES the cache (no re-adding, unlike
 *   Anthropic), `cached_input_tokens` is its share.
 * - `{type:"turn.failed", error:{message}}` — the turn's failure (model refused, quota…).
 *   The message often nests the API's raw JSON: we extract the useful text from it.
 *
 * ⚠️ `agent_message` can arrive MULTIPLE times in one turn (the model announces then
 * concludes) — each one is a chunk of the response, concatenated in arrival order.
 */
import type { TokenUsage } from "@openmasq/llm";
import type { CliAction } from "./spawnStream";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function codexUsage(usage: unknown): TokenUsage | undefined {
  if (!isRecord(usage)) return undefined;
  const num = (k: string): number | undefined =>
    typeof usage[k] === "number" ? (usage[k] as number) : undefined;
  const inputTokens = num("input_tokens");
  const outputTokens = num("output_tokens");
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const cached = num("cached_input_tokens");
  const written = num("cache_write_input_tokens");
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    ...(cached ? { cachedInputTokens: cached } : {}),
    ...(written ? { cacheWriteInputTokens: written } : {}),
  };
}

/**
 * The failure message, made readable. The CLI often wraps the raw API response in
 * a JSON string (`{"type":"error","status":400,"error":{"message":"…"}}`) — we return
 * the INNER message when it exists, the string as-is otherwise. Never a
 * `[object Object]`, never silence.
 */
export function codexErrorMessage(error: unknown): string {
  const raw = isRecord(error) ? error["message"] : error;
  if (typeof raw !== "string" || !raw) return "La CLI Codex a terminé en erreur.";
  try {
    const inner = JSON.parse(raw) as unknown;
    if (isRecord(inner) && isRecord(inner["error"])) {
      const m = inner["error"]["message"];
      if (typeof m === "string" && m) return m;
    }
  } catch {
    /* not JSON: the string is already the message */
  }
  return raw;
}

export function interpretCodexEvent(event: unknown): CliAction | null {
  if (!isRecord(event)) return null;

  switch (event["type"]) {
    case "thread.started": {
      const id = event["thread_id"];
      return typeof id === "string" && id ? { kind: "session", id } : null;
    }
    case "item.completed": {
      const item = event["item"];
      if (!isRecord(item) || item["type"] !== "agent_message") return null;
      const text = item["text"];
      return typeof text === "string" && text ? { kind: "text", delta: text } : null;
    }
    case "turn.completed":
      return { kind: "done", usage: codexUsage(event["usage"]), finish: "stop" };
    case "turn.failed":
      return { kind: "error", message: codexErrorMessage(event["error"]) };
    default:
      // turn.started, item.started, command_execution/web_search/reasoning: ignored.
      return null;
  }
}
