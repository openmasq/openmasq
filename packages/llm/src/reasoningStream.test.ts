import { describe, expect, it, vi, afterEach } from "vitest";
import { streamOpenAI } from "./providers/openai.js";
import { streamAnthropic } from "./providers/anthropic.js";
import { streamGoogle } from "./providers/google.js";
import { streamOpenAITools } from "./tools/openai.js";
import { anthropicToolsBody } from "./tools/anthropicBody.js";
import type { CompleteToolsOptions, StreamChatOptions } from "./types.js";

/**
 * The REFLECTION channel, end to end per provider. Two invariants everything here
 * defends, because breaking either is silent:
 *
 *  • **The reflection is never the answer.** A thought delta reported as text would
 *    paste the model's reasoning into the reply (Gemini's thought parts carry `text`
 *    like any other part, so this is one `if` away at all times).
 *  • **Nobody listening ⇒ the request is byte-identical to before.** The ask-first
 *    providers cost extra tokens and change latency; a redaction/eval/gateway caller
 *    that passes no `onReasoning` must keep exactly the turn it had.
 */
function sse(events: unknown[]): Response {
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function stubFetch(res: () => Response) {
  const spy = vi.fn(async (_url: unknown, _init?: RequestInit) => res());
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
}

/** The JSON body of the (single) request the stub captured. */
function sentBody(spy: ReturnType<typeof stubFetch>): Record<string, unknown> {
  return JSON.parse(spy.mock.calls[0]![1]!.body as string);
}

async function drain(gen: AsyncGenerator<string, unknown>): Promise<string> {
  let text = "";
  for (;;) {
    const r = await gen.next();
    if (r.done) return text;
    text += r.value;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI-compatible (DeepSeek, Nemotron, Qwen…)", () => {
  const OPTS = (extra: Partial<StreamChatOptions> = {}): StreamChatOptions => ({
    provider: "deepseek",
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "hi" }],
    apiKey: "k",
    ...extra,
  });

  it("reports `reasoning_content` as reflection, never as answer text", async () => {
    const seen: string[] = [];
    stubFetch(() =>
      sse([
        { choices: [{ delta: { reasoning_content: "L'utilisateur demande " } }] },
        { choices: [{ delta: { reasoning_content: "la météo." } }] },
        { choices: [{ delta: { content: "Il fait beau." } }] },
        "[DONE]",
      ]),
    );
    const text = await drain(
      streamOpenAI(OPTS({ onReasoning: (d) => seen.push(d) }), "https://x/v1"),
    );
    expect(seen.join("")).toBe("L'utilisateur demande la météo.");
    expect(text).toBe("Il fait beau."); // the reflection is NOT in the reply
  });

  it("a reasoning-ONLY turn still falls back to the reflection as the answer", async () => {
    stubFetch(() =>
      sse([{ choices: [{ delta: { reasoning_content: "<think>tout est là</think>" } }] }, "[DONE]"]),
    );
    expect(await drain(streamOpenAI(OPTS(), "https://x/v1"))).toBe("tout est là");
  });

  it("asks OpenRouter for its reasoning — but only when someone listens", async () => {
    const withListener = stubFetch(() => sse(["[DONE]"]));
    await drain(
      streamOpenAI(
        OPTS({ provider: "openrouter", model: "x-ai/grok-4.20", onReasoning: () => {} }),
        "https://x/v1",
      ),
    );
    expect(sentBody(withListener).reasoning).toEqual({ enabled: true });

    vi.unstubAllGlobals();
    const silent = stubFetch(() => sse(["[DONE]"]));
    await drain(streamOpenAI(OPTS({ provider: "openrouter", model: "x-ai/grok-4.20" }), "https://x/v1"));
    expect(sentBody(silent)).not.toHaveProperty("reasoning");
  });

  it("never sends the field to the OTHER compatibles (an unknown field can 400)", async () => {
    const spy = stubFetch(() => sse(["[DONE]"]));
    await drain(streamOpenAI(OPTS({ provider: "openai-compat", onReasoning: () => {} }), "https://x/v1"));
    expect(sentBody(spy)).not.toHaveProperty("reasoning");
  });

  it("streams the reflection on the AGENTIC path too", async () => {
    const seen: string[] = [];
    stubFetch(() =>
      sse([
        { choices: [{ delta: { reasoning_content: "je réfléchis" } }] },
        { choices: [{ delta: { content: "voilà" } }] },
        "[DONE]",
      ]),
    );
    const opts: CompleteToolsOptions = {
      provider: "deepseek",
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hi" }],
      onReasoning: (d) => seen.push(d),
    };
    expect(await drain(streamOpenAITools(opts, "https://x/v1"))).toBe("voilà");
    expect(seen.join("")).toBe("je réfléchis");
  });
});

describe("Anthropic", () => {
  const OPTS = (extra: Partial<StreamChatOptions> = {}): StreamChatOptions => ({
    provider: "anthropic",
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "hi" }],
    apiKey: "k",
    ...extra,
  });

  it("asks for SUMMARIZED thinking and raises the shared max_tokens", async () => {
    const spy = stubFetch(() => sse([{ type: "message_stop" }]));
    await drain(streamAnthropic(OPTS({ onReasoning: () => {} })));
    const body = sentBody(spy);
    // `display` is the whole point: the default "omitted" streams EMPTY thinking text.
    expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(body.max_tokens).toBe(16000);
  });

  it("nobody listening ⇒ no thinking field and the previous 4096 cap", async () => {
    const spy = stubFetch(() => sse([{ type: "message_stop" }]));
    await drain(streamAnthropic(OPTS()));
    expect(sentBody(spy)).not.toHaveProperty("thinking");
    expect(sentBody(spy).max_tokens).toBe(4096);
  });

  it("never asks a model that predates adaptive thinking (Haiku 4.5)", async () => {
    const spy = stubFetch(() => sse([{ type: "message_stop" }]));
    await drain(streamAnthropic(OPTS({ model: "claude-haiku-4-5", onReasoning: () => {} })));
    expect(sentBody(spy)).not.toHaveProperty("thinking");
  });

  it("reports `thinking_delta`, and keeps it out of the answer", async () => {
    const seen: string[] = [];
    stubFetch(() =>
      sse([
        { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "je pèse le pour" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "Réponse." } },
        { type: "message_stop" },
      ]),
    );
    const text = await drain(streamAnthropic(OPTS({ onReasoning: (d) => seen.push(d) })));
    expect(seen.join("")).toBe("je pèse le pour");
    expect(text).toBe("Réponse.");
  });

  it("a TOOL turn keeps its exact previous body — thinking blocks can't be replayed", () => {
    const opts: CompleteToolsOptions = {
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "t", parameters: { type: "object" } }],
      onReasoning: () => {},
    };
    const body = JSON.parse(anthropicToolsBody(opts, true));
    expect(body).not.toHaveProperty("thinking");
    expect(body.max_tokens).toBe(4096);
    // …while the same turn WITHOUT tools does ask (the plain agentic turn).
    const noTools = JSON.parse(anthropicToolsBody({ ...opts, tools: [] }, true));
    expect(noTools.thinking).toEqual({ type: "adaptive", display: "summarized" });
  });
});

describe("Google Gemini", () => {
  const OPTS = (extra: Partial<StreamChatOptions> = {}): StreamChatOptions => ({
    provider: "google",
    model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "hi" }],
    apiKey: "k",
    ...extra,
  });

  it("asks for thought summaries only when someone listens", async () => {
    const spy = stubFetch(() => sse([]));
    await drain(streamGoogle(OPTS({ onReasoning: () => {} })));
    expect((sentBody(spy).generationConfig as Record<string, unknown>).thinkingConfig).toEqual({
      includeThoughts: true,
    });

    vi.unstubAllGlobals();
    const silent = stubFetch(() => sse([]));
    await drain(streamGoogle(OPTS()));
    expect(sentBody(silent).generationConfig).not.toHaveProperty("thinkingConfig");
  });

  it("never asks a model with no thinking stage (2.0 and older)", async () => {
    const spy = stubFetch(() => sse([]));
    await drain(streamGoogle(OPTS({ model: "gemini-2.0-flash", onReasoning: () => {} })));
    expect(sentBody(spy).generationConfig).not.toHaveProperty("thinkingConfig");
  });

  it("a `thought` part is reported, NOT yielded (it carries `text` like any other)", async () => {
    const seen: string[] = [];
    stubFetch(() =>
      sse([
        {
          candidates: [
            {
              content: {
                parts: [
                  { text: "je planifie la réponse", thought: true },
                  { text: "Bonjour." },
                ],
              },
            },
          ],
        },
      ]),
    );
    const text = await drain(streamGoogle(OPTS({ onReasoning: (d) => seen.push(d) })));
    expect(seen.join("")).toBe("je planifie la réponse");
    expect(text).toBe("Bonjour.");
  });
});
