import { readSSE } from "../wire/index.js";
import { retryAfterHint, requestIdHint } from "../apiError.js";
import { anthropicEndpoint } from "../providers/anthropicEndpoint.js";
import { anthropicToolsBody, anthropicUsage, STOP } from "./anthropicBody.js";
import { parseArgs } from "./parseArgs.js";
import type { CompleteToolsOptions, CompleteToolsResult, ToolCall, TokenUsage } from "../types.js";

/** Report the streamed tool-argument length only every ~128 chars (bounds IPC traffic).
 *  Same threshold as the OpenAI path so the two feel identical in the Debug Log. */
const ARGS_REPORT_STEP = 128;

/**
 * STREAMING agentic turn for Anthropic — yields assistant text deltas as they arrive
 * and RETURNS the assembled turn (text + tool calls + usage), exactly like
 * `streamOpenAITools`.
 *
 * Why it exists: EVERY send enters the agentic loop as soon as any MCP connector is
 * connected, so while this path was non-streamed a Claude user sat in front of a frozen
 * "rédige la réponse…" until the whole turn landed as one blob. Nothing about the loop's
 * semantics changes — same request body (hence the same prompt-cache breakpoints), same
 * result shape; only the delivery is incremental.
 *
 * The Anthropic stream is block-structured, not delta-flat like OpenAI's: each content
 * block is opened (`content_block_start`, which is where a `tool_use` block's id + name
 * arrive), then filled (`content_block_delta` — `text_delta` for prose,
 * `input_json_delta.partial_json` for tool arguments, a fragment at a time), then closed.
 * So tool calls are assembled by block INDEX, and a tool's arguments are a JSON string
 * concatenated across events — which is why they go through the shared `parseArgs`: a
 * stream cut mid-arguments (max_tokens) yields invalid JSON, and reporting that as
 * `argsError` lets the loop hand it back instead of dispatching a silently-empty call.
 */
export async function* streamAnthropicTools(
  opts: CompleteToolsOptions,
): AsyncGenerator<string, CompleteToolsResult> {
  // DIRECT (user key → api.anthropic.com) vs PLATFORM (Supabase JWT → platform gateway
  // `${baseUrl}/v1/messages`). See `anthropicEndpoint`.
  const { url, headers } = anthropicEndpoint(opts.apiKey, opts.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: opts.signal,
    body: anthropicToolsBody(opts, true),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    // Fail-fast like the non-streaming twin (no retry loop): the correlation id is what
    // makes a 502 traceable in the gateway's logs.
    throw new Error(
      `Anthropic tools request failed (${res.status})${retryAfterHint(res, body)}${requestIdHint(res)}: ${body}`,
    );
  }

  // Tool-use blocks, keyed by their content-block index. `args` accumulates the
  // `input_json_delta` fragments; a block with no arguments never emits one, so the
  // empty string is legitimate and `parseArgs` maps it to `{}`.
  const byIndex = new Map<number, { id: string; name: string; args: string }>();
  let text = "";
  let stopReason: string | undefined;
  // input + cache counts arrive on `message_start`; `message_delta` then carries the
  // running output count. Merged so the returned usage has both halves.
  let startUsage: TokenUsage | undefined;
  let outputTokens = 0;
  let argsLen = 0;
  let reportedArgsLen = 0;

  for await (const data of readSSE(res, opts.signal)) {
    let json: {
      type?: string;
      index?: number;
      message?: { usage?: unknown };
      content_block?: { type?: string; id?: string; name?: string };
      delta?: {
        type?: string;
        text?: string;
        thinking?: string;
        partial_json?: string;
        stop_reason?: string;
      };
      usage?: { output_tokens?: number };
      error?: { message?: string };
    };
    try {
      json = JSON.parse(data);
    } catch {
      continue; // keep-alive / non-JSON line
    }

    switch (json.type) {
      case "message_start":
        startUsage = anthropicUsage(json.message?.usage);
        outputTokens = startUsage?.outputTokens ?? 0;
        break;
      case "content_block_start":
        if (json.content_block?.type === "tool_use") {
          byIndex.set(json.index ?? 0, {
            id: json.content_block.id ?? "",
            name: json.content_block.name ?? "",
            args: "",
          });
        }
        break;
      case "content_block_delta": {
        if (json.delta?.type === "text_delta" && json.delta.text) {
          text += json.delta.text;
          yield json.delta.text;
        } else if (json.delta?.type === "thinking_delta" && json.delta.thinking) {
          // A THIRD block kind alongside prose and tool arguments: the reflection.
          // Reported, never yielded — it is not part of the assistant's answer.
          opts.onReasoning?.(json.delta.thinking);
        } else if (json.delta?.type === "input_json_delta" && typeof json.delta.partial_json === "string") {
          const acc = byIndex.get(json.index ?? 0);
          if (acc) {
            acc.args += json.delta.partial_json;
            argsLen += json.delta.partial_json.length;
            if (opts.onToolArgs && argsLen - reportedArgsLen >= ARGS_REPORT_STEP) {
              reportedArgsLen = argsLen;
              // The name arrived on `content_block_start`, so it's already known — pass it
              // so the UI can name the action concretely rather than a generic "action…".
              opts.onToolArgs(argsLen, acc.name || undefined);
            }
          }
        }
        break;
      }
      case "message_delta":
        if (typeof json.delta?.stop_reason === "string") stopReason = json.delta.stop_reason;
        if (typeof json.usage?.output_tokens === "number") outputTokens = json.usage.output_tokens;
        break;
      case "error":
        throw new Error(json.error?.message ?? "Anthropic stream error");
      default:
        break;
    }
    if (json.type === "message_stop") break;
  }

  const toolCalls: ToolCall[] = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, acc]) => {
      const { args, error } = parseArgs(acc.args);
      return { id: acc.id, name: acc.name, arguments: args, ...(error ? { argsError: error } : {}) };
    });

  // `message_start` carries the input + cache halves, `message_delta` the final output
  // count — neither alone is the turn's usage.
  const usage: TokenUsage | undefined =
    startUsage || outputTokens
      ? { ...(startUsage ?? { inputTokens: 0, outputTokens: 0 }), outputTokens }
      : undefined;

  return {
    text,
    toolCalls,
    // `stop_reason` is absent when the stream was cut before `message_delta` — map that
    // to "other" rather than inventing a clean "stop" (the caller flags an incomplete
    // reply on it), matching the non-streaming twin's `STOP[...] ?? "other"`.
    stopReason: STOP[stopReason as string] ?? "other",
    usage,
  };
}
