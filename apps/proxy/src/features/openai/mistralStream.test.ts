import { describe, expect, it } from "vitest";
import { unredactArgs, unredactReply } from "@openmasq/redact";
import { OpenAiStreamRewriter } from "./stream";
import type { SseFrame } from "../../lib/sse";

// Mistral streams `delta.content` as a LIST of parts (its `thinking` beside the text) and a
// tool call's `arguments` as a whole OBJECT. Both must come back restored, a fake split across
// frames included — a thinking part left with fakes is re-masked into NEW fakes next turn.
const vault = { "Marc Charvet": "Camille Roussel" };
const fns = {
  reply: (t: string) => unredactReply(t, vault),
  args: (t: string) => unredactArgs(t, vault),
};
const frame = (delta: Record<string, unknown>, finish: string | null = null): SseFrame => ({
  data: JSON.stringify({
    id: "x",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta, finish_reason: finish }],
  }),
});
const think = (text: string) => ({
  type: "thinking",
  thinking: [{ type: "text", text }],
});
const all = (frames: SseFrame[]) => frames.map((f) => f.data).join("\n");

describe("OpenAI stream rewriter — Mistral's shapes", () => {
  it("restores thinking and text parts, each with its own held-back tail", () => {
    const rw = new OpenAiStreamRewriter(vault, fns);
    const out = [
      ...rw.rewrite(frame({ content: [think("Writing to Marc ")] })),
      ...rw.rewrite(frame({ content: [think("Charvet now")] })),
      ...rw.rewrite(frame({ content: [{ type: "text", text: "Dear Marc Char" }] })),
      ...rw.rewrite(frame({ content: [{ type: "text", text: "vet" }] }, "stop")),
      ...rw.rewrite({ data: "[DONE]" }),
    ];
    const text = all(out);
    expect(text).not.toContain("Charvet");
    expect(text.replace(/[^A-Za-z ]/g, "")).toContain("Camille Roussel");
  });

  it("restores OBJECT arguments in the frame they arrive in", () => {
    const rw = new OpenAiStreamRewriter(vault, fns);
    const [out] = rw.rewrite(
      frame({
        tool_calls: [
          {
            index: 0,
            id: "t",
            function: { name: "mail", arguments: { to: "Marc Charvet" } },
          },
        ],
      }),
    );
    expect(JSON.parse(out.data).choices[0].delta.tool_calls[0].function.arguments).toEqual({
      to: "Camille Roussel",
    });
  });

  it("releases a held thinking tail as a thinking part when the stream ends", () => {
    const rw = new OpenAiStreamRewriter(vault, fns);
    rw.rewrite(frame({ content: [think("about Marc Char")] }));
    const tail = rw.end();
    // Its shape, not a restore: an unfinished fake at the very end is not a fake.
    expect(JSON.parse(tail[0].data).choices[0].delta.content).toEqual([think("Marc Char")]);
  });
});
