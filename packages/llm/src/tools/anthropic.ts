import { retryAfterHint, requestIdHint } from "../apiError.js";
import { anthropicEndpoint } from "../providers/anthropicEndpoint.js";
import { anthropicToolsBody, anthropicUsage, STOP } from "./anthropicBody.js";
import type { CompleteToolsOptions, CompleteToolsResult, ToolCall } from "../types.js";

/** Non-streaming Anthropic completion with tool-calling.
 *
 *  Kept for the callers that can't consume a generator; the desktop's agentic loop now
 *  prefers the STREAMING twin (`streamAnthropicTools`) — see `tools/index.ts`. Both
 *  share one request body (`anthropicToolsBody`), so the prompt-cache breakpoints and
 *  the message translation cannot drift between them. */
export async function completeAnthropicTools(
  opts: CompleteToolsOptions,
): Promise<CompleteToolsResult> {
  // DIRECT (user key → api.anthropic.com) vs PLATFORM (Supabase JWT → platform gateway
  // `${baseUrl}/v1/messages`). The gateway proxies the tools body verbatim. See
  // `anthropicEndpoint`.
  const { url, headers } = anthropicEndpoint(opts.apiKey, opts.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: opts.signal,
    body: anthropicToolsBody(opts, false),
  });

  if (!res.ok) {
    const body = await res.text();
    // NOTE: this path deliberately has NO retry loop (unlike tools/openai.ts) — the
    // correlation id is what makes a fail-fast 502 traceable in the gateway's logs.
    throw new Error(`Anthropic tools request failed (${res.status})${retryAfterHint(res, body)}${requestIdHint(res)}: ${body}`);
  }

  const json = await res.json();
  const blocks: Array<Record<string, unknown>> = json.content ?? [];
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const b of blocks) {
    if (b.type === "text") text += b.text as string;
    else if (b.type === "tool_use")
      toolCalls.push({
        id: b.id as string,
        name: b.name as string,
        arguments: (b.input as Record<string, unknown>) ?? {},
      });
  }

  return {
    text,
    toolCalls,
    stopReason: STOP[json.stop_reason as string] ?? "other",
    usage: anthropicUsage(json.usage),
  };
}
