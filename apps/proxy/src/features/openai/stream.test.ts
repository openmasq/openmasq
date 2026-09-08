import { describe, expect, it } from "vitest";
import { unredactArgs, unredactReply } from "@openmasq/redact";
import { AnthropicStreamRewriter } from "../anthropic/stream";
import { OpenAiStreamRewriter } from "./stream";
import type { SseFrame } from "../../lib/sse";

const vault = { "Marc Charvet": "Camille Roussel" };
const fns = {
  reply: (t: string) => unredactReply(t, vault),
  args: (t: string) => unredactArgs(t, vault),
};
const data = (frames: SseFrame[]) => frames.map((f) => f.data);
const parse = (f: SseFrame) => JSON.parse(f.data) as Record<string, any>;

describe("OpenAI stream rewriter", () => {
  const chunk = (
    content: string | undefined,
    finish: string | null = null,
    extra: Record<string, unknown> = {},
  ) => ({
    data: JSON.stringify({
      id: "x",
      object: "chat.completion.chunk",
      created: 1,
      model: "m",
      choices: [
        { index: 0, delta: content === undefined ? extra : { content }, finish_reason: finish },
      ],
    }),
  });

  it("restores a name split across chunks and releases the rest on finish_reason", () => {
    const rw = new OpenAiStreamRewriter(vault, fns);
    const out = [
      ...rw.rewrite(chunk("Dear Marc ")),
      ...rw.rewrite(chunk("Char")),
      ...rw.rewrite(chunk("vet, hi")),
      ...rw.rewrite(chunk("", "stop")),
      ...rw.rewrite({ data: "[DONE]" }),
    ];
    const texts = out
      .filter((f) => f.data !== "[DONE]")
      .map((f) => parse(f).choices[0].delta.content ?? "");
    expect(texts.join("")).toBe("Dear Camille Roussel, hi");
    for (const t of texts) expect(t).not.toMatch(/Marc|Charvet/);
    expect(out[out.length - 1].data).toBe("[DONE]");
  });

  it("restores tool-call arguments as they stream, with the executor's restore", () => {
    const rw = new OpenAiStreamRewriter(vault, fns);
    const tc = (args: string) =>
      chunk(undefined, null, { tool_calls: [{ index: 0, function: { arguments: args } }] });
    const out = [
      ...rw.rewrite(tc('{"to":"Marc ')),
      ...rw.rewrite(tc('Charvet"}')),
      ...rw.rewrite(chunk("", "tool_calls")),
    ];
    const args = out
      .map(
        (f) =>
          parse(f)
            .choices[0].delta.tool_calls?.map(
              (c: { function: { arguments: string } }) => c.function.arguments,
            )
            .join("") ?? "",
      )
      .join("");
    expect(args).toBe('{"to":"Camille Roussel"}');
  });

  it("drains what is held when the stream ends without finish_reason", () => {
    const rw = new OpenAiStreamRewriter(vault, fns);
    // "Marc Char" could still become the fake: held back, not released.
    const first = parse(rw.rewrite(chunk("Dear Marc Char"))[0]).choices[0].delta.content;
    expect(first).toBe("Dear ");
    expect(data(rw.end()).map((d) => JSON.parse(d).choices[0].delta.content)).toEqual([
      "Marc Char",
    ]);
  });
});

describe("Anthropic stream rewriter", () => {
  const ev = (type: string, body: Record<string, unknown>): SseFrame => ({
    event: type,
    data: JSON.stringify({ type, ...body }),
  });

  it("restores text deltas per block and flushes before content_block_stop", () => {
    const rw = new AnthropicStreamRewriter(vault, fns);
    const out = [
      ...rw.rewrite(
        ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
      ),
      ...rw.rewrite(
        ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hi Marc " } }),
      ),
      ...rw.rewrite(
        ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Charvet" } }),
      ),
      ...rw.rewrite(ev("content_block_stop", { index: 0 })),
    ];
    const text = out
      .filter((f) => f.event === "content_block_delta")
      .map((f) => parse(f).delta.text)
      .join("");
    expect(text).toBe("Hi Camille Roussel");
    expect(out[out.length - 1].event).toBe("content_block_stop");
    expect(out[out.length - 2].event).toBe("content_block_delta"); // the synthetic flush
  });

  it("restores tool_use input JSON fragments with the executor's restore", () => {
    const rw = new AnthropicStreamRewriter(vault, fns);
    const out = [
      ...rw.rewrite(
        ev("content_block_start", {
          index: 1,
          content_block: { type: "tool_use", id: "t", name: "f", input: {} },
        }),
      ),
      ...rw.rewrite(
        ev("content_block_delta", {
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"who":"Marc Ch' },
        }),
      ),
      ...rw.rewrite(
        ev("content_block_delta", {
          index: 1,
          delta: { type: "input_json_delta", partial_json: 'arvet"}' },
        }),
      ),
      ...rw.rewrite(ev("content_block_stop", { index: 1 })),
    ];
    const json = out
      .filter((f) => f.event === "content_block_delta")
      .map((f) => parse(f).delta.partial_json)
      .join("");
    expect(JSON.parse(json)).toEqual({ who: "Camille Roussel" });
  });
});
