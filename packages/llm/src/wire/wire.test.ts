import { describe, it, expect } from "vitest";
import {
  readSSE,
  sseDataPayloads,
  sseJsonEvents,
  anthropicUsage,
  anthropicUsageFromSse,
  openaiUsage,
  openaiUsageFromSse,
  googleUsage,
  anthropicStreamedText,
  openaiStreamedText,
  anthropicPromptText,
  openaiPromptText,
} from "./index.js";

/** A realistic Anthropic stream whose prompt was mostly served FROM CACHE: 12 tokens
 *  billed full price, 4 000 read from the cache, 500 written into it. */
const ANTHROPIC_CACHED_SSE = [
  "event: message_start",
  'data: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1,' +
    '"cache_read_input_tokens":4000,"cache_creation_input_tokens":500}}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bonjour"}}',
  "",
  "event: message_delta",
  'data: {"type":"message_delta","usage":{"output_tokens":73}}',
  "",
].join("\n");

describe("sse — one scanner decides what a data line is", () => {
  it("drops [DONE] and non-data lines, and survives CRLF framing", () => {
    const text = "event: ping\r\ndata: {\"a\":1}\r\n\r\n: keep-alive\r\ndata: [DONE]\r\n\r\n";
    expect(sseDataPayloads(text)).toEqual(['{"a":1}']);
    expect(sseJsonEvents(text)).toEqual([{ a: 1 }]);
  });

  it("skips a frame cut mid-JSON instead of throwing", () => {
    expect(sseJsonEvents('data: {"a":1}\n\ndata: {"b":')).toEqual([{ a: 1 }]);
  });
});

describe("sse — un flux devenu muet ne peut pas bloquer indéfiniment", () => {
  /** A response whose body never enqueues and never closes: the exact shape of a
   *  dropped connection no proxy ever RSTs. `reader.read()` on it waits forever. */
  const silent = () => new Response(new ReadableStream({ start() {} }));

  /** A response that emits one event, then goes silent — the case the TTFT watchdog
   *  misses entirely, because the first token DID arrive. */
  const goesSilentAfterOneEvent = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"a":1}\n\n'));
        },
      }),
    );

  it("rejette après le délai d'inactivité au lieu d'attendre pour toujours", async () => {
    await expect(readSSE(silent(), undefined, 20).next()).rejects.toThrow(/aucune donnée reçue/i);
  });

  it("coupe aussi un flux qui a PARLÉ puis s'est tu (ce que le watchdog TTFT ne voit pas)", async () => {
    const stream = readSSE(goesSilentAfterOneEvent(), undefined, 20);
    await expect(stream.next()).resolves.toMatchObject({ value: '{"a":1}' });
    await expect(stream.next()).rejects.toThrow(/aucune donnée reçue/i);
  });

  it("l'erreur n'est PAS un AbortError", async () => {
    // `isAbortError` (mcpAgentAbort.ts) makes the agent loop finalise the turn SILENTLY,
    // as if the user had pressed Stop. A stall dressed as an abort would tell the user
    // they cancelled their own message. It must read as a failure.
    const err = await readSSE(silent(), undefined, 20)
      .next()
      .catch((e: unknown) => e);
    expect((err as Error).name).not.toBe("AbortError");
  });

  it("un flux qui parle dans les temps n'est jamais coupé", async () => {
    // ⚠️ The margin here is 300× the delay ON PURPOSE. A negative timing test whose
    // budget is close to the delay it must NOT trip is a flake waiting for a loaded CI
    // box: the assertion is "a stream that keeps talking survives", and that claim does
    // not need a tight deadline to be proven. The positive cases below use a silent
    // stream, which can never beat any deadline, so they stay tight and fast.
    const chunks = ['data: {"a":1}\n\n', 'data: {"b":2}\n\n'];
    const response = new Response(
      new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            await new Promise((r) => setTimeout(r, 10));
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      }),
    );
    const seen: string[] = [];
    for await (const data of readSSE(response, undefined, 3_000)) seen.push(data);
    expect(seen).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("`0` désactive la garde (aucun timer n'est armé)", async () => {
    const stream = readSSE(goesSilentAfterOneEvent(), undefined, 0);
    await expect(stream.next()).resolves.toMatchObject({ value: '{"a":1}' });
    // Nothing to await on the silent read — just prove the first read succeeded and
    // return, letting the generator's `finally` cancel the reader.
    await stream.return(undefined);
  });
});

describe("anthropic usage — cached tokens are a PART of inputTokens", () => {
  it("folds cache read + write back into inputTokens", () => {
    expect(
      anthropicUsage({
        input_tokens: 12,
        output_tokens: 73,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 500,
      }),
    ).toEqual({
      inputTokens: 4512,
      outputTokens: 73,
      cachedInputTokens: 4000,
      cacheWriteInputTokens: 500,
    });
  });

  it("reports plain counts untouched, and nothing at all for no usage", () => {
    expect(anthropicUsage({ input_tokens: 10, output_tokens: 5 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(anthropicUsage(undefined)).toBeUndefined();
  });

  /**
   * ⚠️ REGRESSION (the gateway under-metered cached prompts). The buffered scan the
   * metering path runs on a relayed stream must reach the SAME counts as the live
   * client parser. The bug it pins: reading `message_start.message.usage.input_tokens`
   * verbatim reported 12 input tokens for a 4 512-token prompt — the platform paid Anthropic
   * for the cache write (~1.25×) and read (~0.1×) and metered the user for neither.
   */
  it("scans a buffered stream to the same counts as the live parser", () => {
    expect(anthropicUsageFromSse(ANTHROPIC_CACHED_SSE)).toEqual({
      inputTokens: 4512,
      outputTokens: 73,
      cachedInputTokens: 4000,
      cacheWriteInputTokens: 500,
    });
  });

  it("takes the CUMULATIVE output from message_delta, keeping message_start's input", () => {
    const usage = anthropicUsageFromSse(ANTHROPIC_CACHED_SSE);
    // message_start said output_tokens:1; the delta's 73 is the real total.
    expect(usage?.outputTokens).toBe(73);
    expect(usage?.inputTokens).toBe(4512);
  });

  it("returns undefined when the stream carried no usage at all", () => {
    expect(anthropicUsageFromSse('data: {"type":"ping"}\n\n')).toBeUndefined();
  });
});

describe("openai usage — prompt_tokens ALREADY includes the cached part", () => {
  it("surfaces cached_tokens without adding it", () => {
    expect(
      openaiUsage({
        prompt_tokens: 4512,
        completion_tokens: 73,
        prompt_tokens_details: { cached_tokens: 4000 },
      }),
    ).toEqual({ inputTokens: 4512, outputTokens: 73, cachedInputTokens: 4000 });
  });

  it("takes the LAST usage chunk of a buffered stream", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"a"}}]}',
      "",
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":1}}',
      "",
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":42}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    expect(openaiUsageFromSse(sse)).toEqual({ inputTokens: 10, outputTokens: 42 });
  });

  it("returns undefined when no usage chunk arrived (client aborted early)", () => {
    expect(openaiUsageFromSse('data: {"choices":[{"delta":{"content":"a"}}]}\n\n')).toBeUndefined();
  });
});

describe("google usage", () => {
  it("reads usageMetadata", () => {
    expect(googleUsage({ promptTokenCount: 9, candidatesTokenCount: 3 })).toEqual({
      inputTokens: 9,
      outputTokens: 3,
    });
    expect(googleUsage(undefined)).toBeUndefined();
  });
});

describe("streamed text — the input to a metering ESTIMATE", () => {
  it("concatenates anthropic text_delta blocks", () => {
    expect(anthropicStreamedText(ANTHROPIC_CACHED_SSE)).toBe("Bonjour");
  });

  it("concatenates openai delta.content", () => {
    const sse = 'data: {"choices":[{"delta":{"content":"Bon"}}]}\n\ndata: {"choices":[{"delta":{"content":"jour"}}]}\n\n';
    expect(openaiStreamedText(sse)).toBe("Bonjour");
  });

  it("flattens both request shapes, string content and block arrays alike", () => {
    expect(openaiPromptText({ messages: [{ content: "a" }, { content: [{ text: "b" }] }] })).toBe("a\nb\n");
    expect(anthropicPromptText({ system: "s", messages: [{ content: [{ text: "m" }] }] })).toBe("s\nm\n");
  });
});
