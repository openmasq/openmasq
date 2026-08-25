import { describe, expect, it, vi, afterEach } from "vitest";
import { streamAnthropicTools } from "./anthropicStream.js";
import { completeAnthropicTools } from "./anthropic.js";
import { anthropicUsage } from "../wire/index.js";
import type { CompleteToolsOptions, CompleteToolsResult } from "../types.js";

/** An Anthropic Messages SSE body — one JSON event per `data:` line. */
function sseResponse(events: unknown[]): Response {
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function stubFetch(res: Response) {
  const fn = vi.fn(async () => res);
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return fn;
}

const OPTS: CompleteToolsOptions = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  // A system message is always present in the real loop — it's half of the cached prefix.
  messages: [
    { role: "system", content: "Tu es un assistant." },
    { role: "user", content: "cherche" },
  ],
  apiKey: "k",
  tools: [{ name: "search", description: "d", parameters: { type: "object", properties: {} } }],
};

async function drain(
  opts: CompleteToolsOptions = OPTS,
): Promise<{ deltas: string[]; result: CompleteToolsResult }> {
  const gen = streamAnthropicTools(opts);
  const deltas: string[] = [];
  for (;;) {
    const r = await gen.next();
    if (r.done) return { deltas, result: r.value };
    deltas.push(r.value);
  }
}

const START = (usage: Record<string, number> = { input_tokens: 10, output_tokens: 1 }) => ({
  type: "message_start",
  message: { usage },
});
const TEXT = (t: string) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } });
const STOP_EVENTS = (reason: string, out = 5) => [
  { type: "message_delta", delta: { stop_reason: reason }, usage: { output_tokens: out } },
  { type: "message_stop" },
];

afterEach(() => vi.unstubAllGlobals());

describe("streamAnthropicTools", () => {
  it("yields text deltas as they arrive and returns the assembled answer", async () => {
    stubFetch(sseResponse([START(), TEXT("Bon"), TEXT("jour"), ...STOP_EVENTS("end_turn")]));
    const { deltas, result } = await drain();
    // The POINT of this path: the text arrives in pieces, not as one blob at the end.
    expect(deltas).toEqual(["Bon", "jour"]);
    expect(result.text).toBe("Bonjour");
    expect(result.toolCalls).toEqual([]);
    expect(result.stopReason).toBe("stop");
  });

  it("assembles a tool call from its block start + input_json_delta fragments", async () => {
    stubFetch(
      sseResponse([
        START(),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: "search" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"q":' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"Paris"}' } },
        { type: "content_block_stop", index: 0 },
        ...STOP_EVENTS("tool_use"),
      ]),
    );
    const { result } = await drain();
    expect(result.toolCalls).toEqual([{ id: "tu_1", name: "search", arguments: { q: "Paris" } }]);
    expect(result.stopReason).toBe("tool_calls");
  });

  it("keeps parallel tool calls apart by block index, in index order", async () => {
    stubFetch(
      sseResponse([
        START(),
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "b", name: "two" } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "a", name: "one" } },
        // Interleaved fragments — the index, not arrival order, decides which call each belongs to.
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"n":2}' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"n":1}' } },
        ...STOP_EVENTS("tool_use"),
      ]),
    );
    const { result } = await drain();
    expect(result.toolCalls.map((c) => [c.name, c.arguments])).toEqual([
      ["one", { n: 1 }],
      ["two", { n: 2 }],
    ]);
  });

  it("a no-argument tool call yields {} — an absent input_json_delta is legitimate", async () => {
    stubFetch(
      sseResponse([
        START(),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t", name: "ping" } },
        ...STOP_EVENTS("tool_use"),
      ]),
    );
    const { result } = await drain();
    expect(result.toolCalls).toEqual([{ id: "t", name: "ping", arguments: {} }]);
  });

  it("reports MALFORMED arguments as argsError instead of dispatching a silently-empty call", async () => {
    // A stream cut mid-arguments (max_tokens) leaves invalid JSON. Degrading to `{}` would
    // send a call the model never meant; `argsError` is what lets the loop hand it back.
    stubFetch(
      sseResponse([
        START(),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t", name: "write" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"body":"tronq' } },
        ...STOP_EVENTS("max_tokens"),
      ]),
    );
    const { result } = await drain();
    expect(result.toolCalls[0].arguments).toEqual({});
    expect(result.toolCalls[0].argsError).toBeTruthy();
    expect(result.stopReason).toBe("length");
  });

  it("reports streamed argument progress with the tool NAME (known from block start)", async () => {
    const onToolArgs = vi.fn();
    const big = "x".repeat(300);
    stubFetch(
      sseResponse([
        START(),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t", name: "write_file" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: `{"b":"${big}"}` } },
        ...STOP_EVENTS("tool_use"),
      ]),
    );
    await drain({ ...OPTS, onToolArgs });
    expect(onToolArgs).toHaveBeenCalled();
    expect(onToolArgs.mock.calls[0][1]).toBe("write_file");
  });

  it("a stream cut before message_delta reports stopReason 'other', never a clean 'stop'", async () => {
    stubFetch(sseResponse([START(), TEXT("Hel")]));
    const { result } = await drain();
    expect(result.text).toBe("Hel");
    expect(result.stopReason).toBe("other");
  });

  it("surfaces an in-stream error event", async () => {
    stubFetch(sseResponse([START(), { type: "error", error: { message: "overloaded" } }]));
    await expect(drain()).rejects.toThrow(/overloaded/);
  });

  it("sends the SAME cached prefix as the non-streaming twin, plus stream:true", async () => {
    // One body builder for both paths: a drifted copy would silently lose the prompt cache
    // on one of them (root rule 9).
    const streamFetch = stubFetch(sseResponse([START(), ...STOP_EVENTS("end_turn")]));
    await drain();
    const streamed = JSON.parse((streamFetch.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    vi.unstubAllGlobals();

    const plainFetch = stubFetch(
      new Response(JSON.stringify({ content: [], stop_reason: "end_turn" }), { status: 200 }),
    );
    await completeAnthropicTools(OPTS);
    const plain = JSON.parse((plainFetch.mock.calls[0] as unknown as [string, { body: string }])[1].body);

    expect(streamed.stream).toBe(true);
    expect(plain.stream).toBeUndefined();
    const { stream: _s, ...streamedRest } = streamed;
    expect(streamedRest).toEqual(plain);
    // The two cache breakpoints that make turns 2+ cheap must be on BOTH.
    expect(streamed.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(streamed.tools.at(-1).cache_control).toEqual({ type: "ephemeral" });
  });
});

describe("anthropicUsage — cached tokens are a PART of inputTokens", () => {
  it("folds the cache read + write back into inputTokens", () => {
    // Anthropic reports them APART from `input_tokens` (OpenAI includes them in
    // `prompt_tokens`). Copying `input_tokens` verbatim would make the total COLLAPSE the
    // moment the cache works — reading "cheaper prompt" where it means "well cached".
    expect(
      anthropicUsage({
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 50,
      }),
    ).toEqual({
      inputTokens: 950,
      outputTokens: 20,
      cachedInputTokens: 800,
      cacheWriteInputTokens: 50,
    });
  });

  it("omits the cache fields when the provider reports none (unchanged shape)", () => {
    expect(anthropicUsage({ input_tokens: 10, output_tokens: 5 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(anthropicUsage(undefined)).toBeUndefined();
  });

  it("carries the cache counts through the streamed turn's usage", async () => {
    stubFetch(
      sseResponse([
        START({ input_tokens: 12, output_tokens: 1, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 }),
        ...STOP_EVENTS("end_turn", 42),
      ]),
    );
    const { result } = await drain();
    // input+cache from `message_start`, the FINAL output count from `message_delta`.
    expect(result.usage).toEqual({
      inputTokens: 4012,
      outputTokens: 42,
      cachedInputTokens: 4000,
      cacheWriteInputTokens: 0,
    });
  });
});
