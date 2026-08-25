import { describe, expect, it, vi, afterEach } from "vitest";
import { streamGoogle } from "./google.js";
import { streamOpenAI } from "./openai.js";
import { streamAnthropic } from "./anthropic.js";
import type { StreamChatOptions, StreamDone } from "../types.js";

// Build an SSE Response the way Gemini's `streamGenerateContent?alt=sse` does
// (one JSON chunk per `data:` line, `finishReason` on the LAST chunk, no `[DONE]`
// sentinel). Ending the body WITHOUT any finishReason simulates a dropped
// stream — the caller must see `cut`, not a clean "done".
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
  provider: "google",
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "hi" }],
  apiKey: "k",
};

async function drain(
  gen: AsyncGenerator<string, StreamDone>,
): Promise<{ text: string; done: StreamDone }> {
  let text = "";
  for (;;) {
    const r = await gen.next();
    if (r.done) return { text, done: r.value };
    text += r.value;
  }
}

const CHUNK = (text: string, finishReason?: string) => ({
  candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

afterEach(() => vi.unstubAllGlobals());

describe("streamGoogle finish detection", () => {
  it("clean end (finishReason STOP) → finish 'stop'", async () => {
    stubFetch(sseResponse([CHUNK("Hello"), CHUNK(" world", "STOP")]));
    const { text, done } = await drain(streamGoogle(OPTS));
    expect(text).toBe("Hello world");
    expect(done.finish).toBe("stop");
  });

  it("MAX_TOKENS cap → finish 'length' (truncated, flaggable by the caller)", async () => {
    stubFetch(sseResponse([CHUNK("trunca"), CHUNK("ted", "MAX_TOKENS")]));
    const { done } = await drain(streamGoogle(OPTS));
    expect(done.finish).toBe("length");
  });

  it("stream dropped mid-reply (no finishReason at all) → finish 'cut'", async () => {
    stubFetch(sseResponse([CHUNK("Hel")]));
    const { text, done } = await drain(streamGoogle(OPTS));
    expect(text).toBe("Hel");
    expect(done.finish).toBe("cut");
  });

  it("SAFETY / RECITATION / unknown reasons → finish 'other'", async () => {
    for (const reason of ["SAFETY", "RECITATION", "OTHER"]) {
      stubFetch(sseResponse([CHUNK("blocked", reason)]));
      const { done } = await drain(streamGoogle(OPTS));
      expect(done.finish).toBe("other");
    }
  });
});

// Rule-9-style parity: `finish` is a cross-provider contract (the send pipeline
// flags a truncated reply on it) — every streamed provider must return a DEFINED
// finish on a clean stream, so a new/edited provider can't silently drop it again.
describe("every streamed provider returns a defined finish", () => {
  const cases: Array<{ name: string; run: () => AsyncGenerator<string, StreamDone> }> = [
    {
      name: "google",
      run: () => {
        stubFetch(sseResponse([CHUNK("ok", "STOP")]));
        return streamGoogle(OPTS);
      },
    },
    {
      name: "openai",
      run: () => {
        const payload =
          `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] })}\n\n` +
          `data: [DONE]\n\n`;
        stubFetch(
          new Response(payload, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        );
        return streamOpenAI(
          { ...OPTS, provider: "openai", model: "gpt-5.4" },
          "https://api.openai.com/v1",
        );
      },
    },
    {
      name: "anthropic",
      run: () => {
        stubFetch(
          sseResponse([
            { type: "message_start", message: { usage: { input_tokens: 1, output_tokens: 1 } } },
            { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
            { type: "message_stop" },
          ]),
        );
        return streamAnthropic({ ...OPTS, provider: "anthropic", model: "claude-sonnet-5" });
      },
    },
  ];

  for (const c of cases) {
    it(`${c.name} → finish defined`, async () => {
      const { done } = await drain(c.run());
      expect(done.finish).toBeDefined();
      expect(["stop", "length", "cut", "other"]).toContain(done.finish);
    });
  }
});
