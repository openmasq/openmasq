import { afterEach, describe, expect, it, vi } from "vitest";
import { completeWithTools, streamWithTools, supportsStreamingTools } from "./index.js";
import { sanitizeGeminiSchema } from "./google.js";
import type { ChatMessage, CompleteToolsResult, ToolDef } from "../types.js";

const tools: ToolDef[] = [
  { name: "gmail__search", description: "Search mail", parameters: { type: "object" } },
];

function mockFetch(body: unknown) {
  const fn = vi.fn(async () => ({
    ok: true,
    json: async () => body,
    text: async () => "",
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fn);
  return fn as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => vi.unstubAllGlobals());

describe("completeWithTools — OpenAI/Mistral", () => {
  it("sends tools and parses tool_calls with JSON-decoded arguments", async () => {
    const fetchFn = mockFetch({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "",
            tool_calls: [
              { id: "call_1", function: { name: "gmail__search", arguments: '{"q":"hi"}' } },
            ],
          },
        },
      ],
    });

    const res = await completeWithTools({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-x",
      messages: [{ role: "user", content: "search my mail" }],
      tools,
    });

    expect(res.stopReason).toBe("tool_calls");
    expect(res.toolCalls).toEqual([
      { id: "call_1", name: "gmail__search", arguments: { q: "hi" } },
    ]);

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools[0].function.name).toBe("gmail__search");
    expect(body.tool_choice).toBe("auto");
  });

  it("expands a user turn's image attachments into image_url parts (doc-as-images)", async () => {
    const fetchFn = mockFetch({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] });
    await completeWithTools({
      provider: "openai",
      model: "gpt-5.4",
      apiKey: "sk-x",
      messages: [
        {
          role: "user",
          content: "résume ce document",
          attachments: [{ kind: "image", mediaType: "image/png", dataBase64: "AAAA" }],
        },
      ],
      tools,
    });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    const user = body.messages[0];
    // NOT a bare string: text + image parts, so the redacted pages actually reach the model.
    expect(user.content).toEqual([
      { type: "text", text: "résume ce document" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });

  it("surfaces argsError (not silent {}) when the model emits invalid JSON args", async () => {
    mockFetch({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "",
            tool_calls: [
              // Trailing comma → not valid JSON. Previously this degraded to {}.
              { id: "call_1", function: { name: "gmail__search", arguments: '{"q":"hi",}' } },
            ],
          },
        },
      ],
    });

    const res = await completeWithTools({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-x",
      messages: [{ role: "user", content: "search my mail" }],
      tools,
    });

    expect(res.toolCalls[0].arguments).toEqual({});
    expect(res.toolCalls[0].argsError).toBeTruthy();
  });

  it("leaves argsError absent for well-formed args", async () => {
    mockFetch({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "",
            tool_calls: [{ id: "c", function: { name: "gmail__search", arguments: '{"q":"ok"}' } }],
          },
        },
      ],
    });
    const res = await completeWithTools({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-x",
      messages: [{ role: "user", content: "x" }],
      tools,
    });
    expect(res.toolCalls[0].argsError).toBeUndefined();
  });

  it("maps toolChoice=required per provider (forces a tool call)", async () => {
    // OpenAI/Mistral → "required"
    let fetchFn = mockFetch({
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
    });
    await completeWithTools({
      provider: "openai", model: "gpt-4o-mini", apiKey: "sk-x",
      messages: [{ role: "user", content: "go" }], tools, toolChoice: "required",
    });
    let body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tool_choice).toBe("required");

    // Anthropic → { type: "any" }
    fetchFn = mockFetch({ stop_reason: "end_turn", content: [] });
    await completeWithTools({
      provider: "anthropic", model: "claude", apiKey: "sk-x",
      messages: [{ role: "user", content: "go" }], tools, toolChoice: "required",
    });
    body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tool_choice).toEqual({ type: "any" });

    // Google → toolConfig.functionCallingConfig.mode = "ANY"
    fetchFn = mockFetch({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "ok" }] } }],
    });
    await completeWithTools({
      provider: "google", model: "gemini", apiKey: "k",
      messages: [{ role: "user", content: "go" }], tools, toolChoice: "required",
    });
    body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.toolConfig.functionCallingConfig.mode).toBe("ANY");
  });

  it("never sends an EMPTY/whitespace text block to Anthropic (agentic history 400 fix)", async () => {
    const fetchFn = mockFetch({ stop_reason: "end_turn", content: [] });
    const messages: ChatMessage[] = [
      { role: "user", content: "cherche mes mails" },
      // A model routinely streams a lone "\n" around a tool call → whitespace content,
      // which Anthropic 400s ("text content blocks must be non-empty") on replay.
      { role: "assistant", content: "\n", toolCalls: [{ id: "t1", name: "gmail__search", arguments: {} }] },
      // A tool can legitimately return NOTHING (an empty search) → empty tool_result.
      { role: "tool", toolCallId: "t1", content: "" },
      { role: "user", content: "et alors ?" },
    ];
    await completeWithTools({ provider: "anthropic", model: "claude", apiKey: "sk-x", messages, tools });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    // Every text block is non-empty after trim; every tool_result content is non-empty.
    for (const msg of body.messages) {
      for (const block of msg.content) {
        if (block.type === "text") expect(block.text.trim().length).toBeGreaterThan(0);
        if (block.type === "tool_result") expect(String(block.content).trim().length).toBeGreaterThan(0);
      }
    }
    // The whitespace assistant turn kept its tool_use but dropped the empty text block.
    const asst = body.messages.find(
      (m: { role: string; content: { type: string }[] }) =>
        m.role === "assistant" && m.content.some((b) => b.type === "tool_use"),
    );
    expect(asst.content.every((b: { type: string }) => b.type !== "text")).toBe(true);
  });

  it("marks Anthropic's system + last tool with cache_control (prompt caching)", async () => {
    const fetchFn = mockFetch({ stop_reason: "end_turn", content: [] });
    const twoTools: ToolDef[] = [
      { name: "a", description: "A", parameters: { type: "object" } },
      { name: "b", description: "B", parameters: { type: "object" } },
    ];
    await completeWithTools({
      provider: "anthropic", model: "claude", apiKey: "sk-x",
      messages: [{ role: "system", content: "You are a helpful agent." }, { role: "user", content: "go" }],
      tools: twoTools,
    });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    // system is an array of blocks with an ephemeral cache breakpoint…
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.system[0].text).toContain("helpful agent");
    // …and ONLY the LAST tool caches (one breakpoint for the whole tools array).
    expect(body.tools.at(-1).cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools[0].cache_control).toBeUndefined();
  });

  it("surfaces a reason when Gemini returns an empty turn (malformed call)", async () => {
    mockFetch({
      candidates: [{ finishReason: "MALFORMED_FUNCTION_CALL", content: { parts: [] } }],
    });
    const res = await completeWithTools({
      provider: "google", model: "gemini-2.5-flash-lite", apiKey: "k",
      messages: [{ role: "user", content: "crée une page" }], tools,
    });
    expect(res.toolCalls).toEqual([]);
    // Not blank — the loop would otherwise show an empty bubble.
    expect(res.text).toMatch(/mal formé l'appel d'outil/);
  });

  it("coerces an empty assistant message so Mistral doesn't 400 (code 3240)", async () => {
    const fetchFn = mockFetch({
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
    });
    await completeWithTools({
      provider: "mistral", model: "mistral-medium-2508", apiKey: "sk-x",
      messages: [
        { role: "user", content: "salut" },
        { role: "assistant", content: "" }, // empty prior reply from history
        { role: "user", content: "et maintenant ?" },
      ],
    });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    // The empty assistant turn must carry non-empty content (Mistral needs one).
    // A single space is trimmed server-side and still 400s, so it's "…".
    expect(body.messages[1]).toEqual({ role: "assistant", content: "…" });
  });

  it("translates assistant tool_calls + tool results back onto the wire", async () => {
    const fetchFn = mockFetch({
      choices: [{ finish_reason: "stop", message: { content: "Found 2 emails." } }],
    });

    const history: ChatMessage[] = [
      { role: "user", content: "search" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "gmail__search", arguments: { q: "hi" } }],
      },
      { role: "tool", toolCallId: "call_1", content: "2 results" },
    ];

    const res = await completeWithTools({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-x",
      messages: history,
    });
    expect(res.text).toBe("Found 2 emails.");

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[1]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "call_1", function: { name: "gmail__search" } }],
    });
    expect(body.messages[2]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "2 results",
    });
  });

  it("retries a 429 (rate limit) then succeeds", async () => {
    const ok = { choices: [{ finish_reason: "stop", message: { content: "ok" } }] };
    let n = 0;
    const fetchFn = vi.fn(async (): Promise<unknown> =>
      n++ === 0
        ? { ok: false, status: 429, headers: { get: () => null }, text: async () => "rate limited" }
        : { ok: true, headers: { get: () => null }, json: async () => ok, text: async () => "" },
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchFn);

    const res = await completeWithTools({
      provider: "openai",
      model: "mistral-large-latest",
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.text).toBe("ok");
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("does NOT retry a permanent gateway 502 (provider key not set) — fails fast", async () => {
    // The gateway 502s identically on every attempt when a platform key is unset, so
    // retrying just burns the whole backoff. It must throw on the FIRST response.
    const fetchFn = vi.fn(async (): Promise<unknown> => ({
      ok: false,
      status: 502,
      headers: { get: () => null },
      text: async () => '{"error":"GEMINI_API_KEY is not set — cannot reach the platform inference upstream."}',
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchFn);

    await expect(
      completeWithTools({
        provider: "openai",
        model: "gemini-3.1-flash-lite",
        apiKey: "k",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(/502/);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("retries a BOUNDED gateway 502 (UPSTREAM_UNAVAILABLE) exactly once, then surfaces", async () => {
    // The gateway strips the real reason ("<KEY> is not set" stays server-side) down to
    // an opaque {"error":"UPSTREAM_UNAVAILABLE"} — permanent misconfig and transient
    // blip are indistinguishable, so ONE quick retry, never the full 6-step backoff
    // (which read as ~30-60s of silent « rédige la réponse… » with no error shown).
    const fetchFn = vi.fn(async (): Promise<unknown> => ({
      ok: false,
      status: 502,
      headers: { get: () => null },
      text: async () => '{"error":"UPSTREAM_UNAVAILABLE","request_id":"30cae4fdc2f0"}',
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchFn);

    await expect(
      completeWithTools({
        provider: "openai",
        model: "openai/gpt-oss-20b:free",
        apiKey: "jwt",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(/UPSTREAM_UNAVAILABLE/);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});

describe("streamWithTools — OpenAI-compatible streaming", () => {
  const ev = (o: unknown) => JSON.stringify(o);

  // A fake fetch whose body streams the given SSE events (one chunk).
  function mockSSE(events: string[]) {
    const payload = events.map((e) => `data: ${e}\n\n`).join("");
    let sent = false;
    const body = {
      getReader() {
        return {
          read: async () =>
            sent
              ? { done: true, value: undefined }
              : ((sent = true), { done: false, value: new TextEncoder().encode(payload) }),
          cancel: async () => {},
        };
      },
    };
    const fn = vi.fn(async () => ({ ok: true, body, text: async () => "" })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fn);
    return fn as unknown as ReturnType<typeof vi.fn>;
  }

  async function drain(gen: AsyncGenerator<string, CompleteToolsResult>) {
    const deltas: string[] = [];
    let r = await gen.next();
    while (!r.done) {
      deltas.push(r.value);
      r = await gen.next();
    }
    return { deltas, result: r.value };
  }

  it("flags the OpenAI-compatible providers AND Anthropic as streamable (Google not)", () => {
    expect(supportsStreamingTools("scaleway")).toBe(true);
    expect(supportsStreamingTools("openai")).toBe(true);
    expect(supportsStreamingTools("mistral")).toBe(true);
    expect(supportsStreamingTools("openai-compat")).toBe(true);
    // Anthropic streams via its own block-structured path (`tools/anthropicStream.ts`).
    // Every send enters the agentic loop as soon as a connector is connected, so while
    // this was false a Claude user waited on the whole turn as one blob.
    expect(supportsStreamingTools("anthropic")).toBe(true);
    // Google's NATIVE tools client still can't; a platform google send (gateway baseUrl,
    // OpenAI-compat shape) could, but this gate is keyed on the provider alone.
    expect(supportsStreamingTools("google")).toBe(false);
  });

  it("streams text deltas and returns the assembled final answer", async () => {
    mockSSE([
      ev({ choices: [{ delta: { content: "Hel" } }] }),
      ev({ choices: [{ delta: { content: "lo" } }] }),
      ev({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1 } }),
      "[DONE]",
    ]);
    const { deltas, result } = await drain(
      streamWithTools({
        provider: "scaleway",
        model: "gemma-4-26b-a4b-it",
        apiKey: "jwt",
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(deltas).toEqual(["Hel", "lo"]); // token-by-token, not one blob
    expect(result.text).toBe("Hello");
    expect(result.toolCalls).toEqual([]);
    expect(result.stopReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 1 });
  });

  it("surfaces reasoning as the answer when a reasoning model emits NO content", async () => {
    // Nemotron streamed its whole turn as `reasoning_content` with an
    // empty `content` — which used to read as "Le modèle n'a renvoyé aucune réponse".
    mockSSE([
      ev({ choices: [{ delta: { reasoning_content: "L'utilisateur demande " } }] }),
      ev({ choices: [{ delta: { reasoning_content: "l'actualité." } }] }),
      ev({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 92 } }),
      "[DONE]",
    ]);
    const { deltas, result } = await drain(
      streamWithTools({
        provider: "scaleway",
        model: "gemma-4-26b-a4b-it",
        apiKey: "jwt",
        messages: [{ role: "user", content: "Quelle actualité ?" }],
      }),
    );
    expect(result.text).toBe("L'utilisateur demande l'actualité."); // not empty
    expect(deltas.join("")).toBe("L'utilisateur demande l'actualité."); // yielded live too
    expect(result.toolCalls).toEqual([]);
  });

  it("prefers real content over reasoning when both are present", async () => {
    mockSSE([
      ev({ choices: [{ delta: { reasoning_content: "thinking…" } }] }),
      ev({ choices: [{ delta: { content: "La réponse." } }] }),
      ev({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "[DONE]",
    ]);
    const { result } = await drain(
      streamWithTools({
        provider: "scaleway",
        model: "gemma-4-26b-a4b-it",
        apiKey: "jwt",
        messages: [{ role: "user", content: "q" }],
      }),
    );
    expect(result.text).toBe("La réponse."); // reasoning is NOT appended
  });

  it("reassembles a tool call whose arguments arrive across chunks", async () => {
    mockSSE([
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "gmail__search", arguments: "" } }] } }] }),
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":' } }] } }] }),
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"hi"}' } }] } }] }),
      ev({ choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 5, completion_tokens: 3 } }),
      "[DONE]",
    ]);
    const { deltas, result } = await drain(
      streamWithTools({
        provider: "scaleway",
        model: "gemma-4-26b-a4b-it",
        apiKey: "jwt",
        messages: [{ role: "user", content: "search my mail" }],
        tools,
      }),
    );
    expect(deltas).toEqual([]); // no text, just a tool call
    expect(result.stopReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "gmail__search", arguments: { q: "hi" } }]);
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
  });

  it("surfaces argsError when the streamed args don't parse", async () => {
    mockSSE([
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c", function: { name: "gmail__search", arguments: '{"q":"hi",}' } }] } }] }),
      ev({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      "[DONE]",
    ]);
    const { result } = await drain(
      streamWithTools({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-x",
        messages: [{ role: "user", content: "x" }],
        tools,
      }),
    );
    expect(result.toolCalls[0].arguments).toEqual({});
    expect(result.toolCalls[0].argsError).toBeTruthy();
  });
});

describe("completeWithTools — Anthropic", () => {
  it("parses tool_use blocks and merges consecutive tool results", async () => {
    const fetchFn = mockFetch({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Let me check." },
        { type: "tool_use", id: "tu_1", name: "gmail__search", input: { q: "hi" } },
      ],
    });

    const history: ChatMessage[] = [
      { role: "user", content: "search" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "tu_a", name: "gmail__search", arguments: {} },
          { id: "tu_b", name: "gmail__search", arguments: {} },
        ],
      },
      { role: "tool", toolCallId: "tu_a", content: "A" },
      { role: "tool", toolCallId: "tu_b", content: "B" },
    ];

    const res = await completeWithTools({
      provider: "anthropic",
      model: "claude-opus-4-8",
      apiKey: "x",
      messages: history,
      tools,
    });

    expect(res.stopReason).toBe("tool_calls");
    expect(res.text).toBe("Let me check.");
    expect(res.toolCalls).toEqual([
      { id: "tu_1", name: "gmail__search", arguments: { q: "hi" } },
    ]);

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    // the two tool results were merged into ONE user turn with two blocks
    const lastUser = body.messages[body.messages.length - 1];
    expect(lastUser.role).toBe("user");
    expect(lastUser.content).toHaveLength(2);
    expect(lastUser.content.every((b: { type: string }) => b.type === "tool_result")).toBe(true);
    expect(body.tools[0].input_schema).toEqual({ type: "object" });
  });

  it("expands a user turn's image attachments into image blocks (doc-as-images)", async () => {
    const fetchFn = mockFetch({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    await completeWithTools({
      provider: "anthropic",
      model: "claude-opus-4-8",
      apiKey: "x",
      messages: [
        {
          role: "user",
          content: "résume ce document",
          attachments: [{ kind: "image", mediaType: "image/png", dataBase64: "AAAA" }],
        },
      ],
      tools,
    });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    // NOT a text-only block: text + image, so the redacted pages actually reach the model.
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "résume ce document" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    ]);
  });
});

describe("completeWithTools — Google (Gemini)", () => {
  it("parses functionCall parts and sends functionDeclarations", async () => {
    const fetchFn = mockFetch({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { text: "Sure." },
              { functionCall: { name: "gmail__search", args: { q: "hi" } } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
    });

    const res = await completeWithTools({
      provider: "google",
      model: "gemini-2.0-flash",
      apiKey: "g",
      messages: [{ role: "user", content: "search my mail" }],
      tools,
    });

    expect(res.stopReason).toBe("tool_calls");
    expect(res.text).toBe("Sure.");
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0]).toMatchObject({ name: "gmail__search", arguments: { q: "hi" } });
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 4 });

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools[0].functionDeclarations[0].name).toBe("gmail__search");
  });

  it("expands a user turn's image attachments into inlineData parts (doc-as-images)", async () => {
    const fetchFn = mockFetch({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "ok" }] } }],
    });
    await completeWithTools({
      provider: "google",
      model: "gemini-2.0-flash",
      apiKey: "g",
      messages: [
        {
          role: "user",
          content: "résume ce document",
          attachments: [{ kind: "image", mediaType: "image/png", dataBase64: "AAAA" }],
        },
      ],
      tools,
    });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    // NOT a text-only part: text + inlineData, so the redacted pages actually reach the model.
    expect(body.contents[0].parts).toEqual([
      { text: "résume ce document" },
      { inlineData: { mimeType: "image/png", data: "AAAA" } },
    ]);
  });

  it("maps assistant functionCall + tool result back to Gemini shape", async () => {
    const fetchFn = mockFetch({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Found 2." }] } }],
    });

    const history: ChatMessage[] = [
      { role: "user", content: "search" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_0_gmail__search", name: "gmail__search", arguments: { q: "hi" } }] },
      { role: "tool", toolCallId: "call_0_gmail__search", content: "2 results" },
    ];

    const res = await completeWithTools({
      provider: "google",
      model: "gemini-2.0-flash",
      apiKey: "g",
      messages: history,
    });
    expect(res.text).toBe("Found 2.");

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[1]).toMatchObject({ role: "model" });
    expect(body.contents[1].parts[0].functionCall.name).toBe("gmail__search");
    // tool result → functionResponse with the resolved function NAME
    expect(body.contents[2].parts[0].functionResponse.name).toBe("gmail__search");
  });

  it("round-trips the Gemini 3 thoughtSignature (capture on read, echo on replay)", async () => {
    // 1. Capture: a functionCall part carries a thoughtSignature → onto the ToolCall.
    mockFetch({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { functionCall: { name: "gmail__search", args: { q: "hi" } }, thoughtSignature: "sig-abc" },
            ],
          },
        },
      ],
    });
    const first = await completeWithTools({
      provider: "google",
      model: "gemini-3-flash-lite",
      apiKey: "g",
      messages: [{ role: "user", content: "search" }],
      tools,
    });
    expect(first.toolCalls[0].thoughtSignature).toBe("sig-abc");

    // 2. Replay: the signature MUST be echoed on the replayed functionCall part,
    //    else Gemini 3+ 400s ("missing thought_signature in functionCall parts").
    const replay = mockFetch({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "done" }] } }],
    });
    await completeWithTools({
      provider: "google",
      model: "gemini-3-flash-lite",
      apiKey: "g",
      messages: [
        { role: "user", content: "search" },
        { role: "assistant", content: "", toolCalls: [first.toolCalls[0]] },
        { role: "tool", toolCallId: first.toolCalls[0].id, content: "2 results" },
      ],
    });
    const body = JSON.parse((replay.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[1].parts[0].thoughtSignature).toBe("sig-abc");
  });

  it("sanitizes JSON-Schema keywords Gemini rejects", () => {
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      propertyNames: { pattern: "^x" },
      properties: {
        id: { type: ["string", "null"], const: "fixed" },
        n: { type: "number", exclusiveMinimum: 0 },
        tags: { type: "array", items: { type: "string", additionalProperties: false } },
        choice: { anyOf: [{ type: "string", additionalProperties: false }, { type: "number" }] },
      },
      required: ["id"],
    };
    const clean = sanitizeGeminiSchema(schema) as any;

    expect(clean.$schema).toBeUndefined();
    expect(clean.additionalProperties).toBeUndefined();
    expect(clean.propertyNames).toBeUndefined();
    // type array with null → single type + nullable
    expect(clean.properties.id.type).toBe("string");
    expect(clean.properties.id.nullable).toBe(true);
    // const → enum
    expect(clean.properties.id.enum).toEqual(["fixed"]);
    // exclusiveMinimum → minimum
    expect(clean.properties.n.minimum).toBe(0);
    expect(clean.properties.n.exclusiveMinimum).toBeUndefined();
    // recursion into items + anyOf strips nested unsupported keys
    expect(clean.properties.tags.items.additionalProperties).toBeUndefined();
    expect(clean.properties.choice.anyOf[0].additionalProperties).toBeUndefined();
    expect(clean.required).toEqual(["id"]);
  });

  it("drops empty enum values / empty const (Gemini rejects empty enum entries)", () => {
    const clean = sanitizeGeminiSchema({
      type: "object",
      properties: {
        link: { anyOf: [{ const: "" }, { enum: ["", "self", null] }] },
        empty: { const: "" },
      },
    }) as any;

    // empty const → no enum, but a valid typed leaf (never {} / typeless)
    expect(clean.properties.empty.enum).toBeUndefined();
    expect(clean.properties.empty.type).toBe("string");
    // anyOf[0] was {const:""} → becomes a typed string leaf, no empty enum
    expect(clean.properties.link.anyOf[0].enum).toBeUndefined();
    expect(clean.properties.link.anyOf[0].type).toBe("string");
    // enum with empties filtered to non-empty values only
    expect(clean.properties.link.anyOf[1].enum).toEqual(["self"]);
  });
});

describe("429 — un quota épuisé ne se réessaie pas", () => {
  /** Failure response, body included (the body IS read once by the loop). */
  function mockFail(status: number, body: string) {
    const fn = vi.fn(async () => ({
      ok: false,
      status,
      headers: new Headers(),
      text: async () => body,
      json: async () => JSON.parse(body),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fn);
    return fn as unknown as ReturnType<typeof vi.fn>;
  }

  const call = () =>
    completeWithTools({
      provider: "openrouter",
      model: "poolside/laguna-s-2.1:free",
      apiKey: "k",
      messages: [{ role: "user", content: "salut" }] as ChatMessage[],
      tools,
    });

  const DAILY = JSON.stringify({
    error: {
      code: 429,
      metadata: {
        headers: { "X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1785715200000" },
        limit_source: "openrouter_free_tier_daily",
      },
    },
  });

  it("échoue du PREMIER coup — 33 s de backoff pour une limite qui bouge demain", async () => {
    const fetchFn = mockFail(429, DAILY);
    await expect(call()).rejects.toThrow(/429/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("et le message NOMME la classe, sans conseiller de patienter", async () => {
    mockFail(429, DAILY);
    await expect(call()).rejects.toThrow(/quota du fournisseur épuisé pour la période/);
  });

  it("une RAFALE, elle, est bien réessayée — le backoff sert à ça", async () => {
    // Driven time: the real backoff waits ~31s, which a test shouldn't have to endure.
    vi.useFakeTimers();
    try {
      const fetchFn = mockFail(429, '{"error":{"message":"Too many requests"}}');
      const p = call().catch(() => "refusé");
      await vi.advanceTimersByTimeAsync(3_000);
      expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(p).resolves.toBe("refusé");
    } finally {
      vi.useRealTimers();
    }
  });

  /** OpenAI's 429 when the ACCOUNT has no credits left: no quota header,
   *  no daily wording — the burst/period detection sees nothing, and the backoff
   *  used to burn ~30-60s against a refusal that only a payment unlocks. */
  const INSUFFICIENT_QUOTA = JSON.stringify({
    error: {
      message: "You exceeded your current quota, please check your plan and billing details.",
      type: "insufficient_quota",
      code: "insufficient_quota",
    },
  });

  it("un compte fournisseur À SEC échoue du premier coup, lui aussi", async () => {
    const fetchFn = mockFail(429, INSUFFICIENT_QUOTA);
    await expect(call()).rejects.toThrow(/429/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("et le journal nomme les crédits, pas une limite de débit", async () => {
    mockFail(429, INSUFFICIENT_QUOTA);
    await expect(call()).rejects.toThrow(/crédits du compte fournisseur épuisés/);
  });
});
