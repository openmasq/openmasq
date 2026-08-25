import { describe, expect, it, vi, afterEach } from "vitest";
import { streamAnthropic } from "./anthropic.js";
import type { StreamChatOptions, StreamDone } from "../types.js";

// Build an SSE Response the way Anthropic's Messages stream does (one JSON event
// per `data:` line). Ending the body WITHOUT `message_stop` simulates a dropped
// stream — which is exactly what the gateway produces when the upstream fails
// mid-stream (it swallows the error and `res.end()`s cleanly).
function sseResponse(events: unknown[]): Response {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(payload, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function stubFetch(res: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => res) as unknown as typeof fetch);
}

const OPTS: StreamChatOptions = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  messages: [{ role: "user", content: "hi" }],
  apiKey: "k",
};

async function drain(): Promise<{ text: string; done: StreamDone }> {
  const gen = streamAnthropic(OPTS);
  let text = "";
  for (;;) {
    const r = await gen.next();
    if (r.done) return { text, done: r.value };
    text += r.value;
  }
}

const START = { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } };
const DELTA = (t: string) => ({
  type: "content_block_delta",
  delta: { type: "text_delta", text: t },
});

afterEach(() => vi.unstubAllGlobals());

describe("streamAnthropic finish detection", () => {
  it("clean end (stop_reason + message_stop) → finish 'stop'", async () => {
    stubFetch(
      sseResponse([
        START,
        DELTA("Hello"),
        DELTA(" world"),
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ]),
    );
    const { text, done } = await drain();
    expect(text).toBe("Hello world");
    expect(done.finish).toBe("stop");
    expect(done.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("stream dropped mid-reply (no stop_reason, no message_stop) → finish 'cut'", async () => {
    stubFetch(sseResponse([START, DELTA("Hel")]));
    const { text, done } = await drain();
    expect(text).toBe("Hel");
    expect(done.finish).toBe("cut");
  });

  it("max_tokens cap → finish 'length'", async () => {
    stubFetch(
      sseResponse([
        START,
        DELTA("truncated"),
        { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 4 } },
        { type: "message_stop" },
      ]),
    );
    const { done } = await drain();
    expect(done.finish).toBe("length");
  });

  it("stop_reason arrived but message_stop was cut off → still 'stop' (reply is complete)", async () => {
    stubFetch(
      sseResponse([
        START,
        DELTA("done"),
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } },
      ]),
    );
    const { done } = await drain();
    expect(done.finish).toBe("stop");
  });
});
