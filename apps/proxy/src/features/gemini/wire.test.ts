import { describe, expect, it } from "vitest";
import { unredactArgs, unredactReply } from "@openmasq/redact";
import { GeminiStreamRewriter } from "./stream";
import { maskGenerateRequest, restoreGenerateResponse } from "./wire";
import type { SseFrame } from "../../lib/sse";

const mask = async (t: string) => t.replace(/Camille/g, "Marc");
const fns = {
  reply: (t: string) => t.replace(/Marc/g, "Camille"),
  args: (t: string) => t.replace(/Marc/g, "Camille"),
};

describe("Gemini wire", () => {
  it("masks the system instruction, text parts, function responses and historic function calls", async () => {
    const out = await maskGenerateRequest(
      {
        systemInstruction: { parts: [{ text: "Serve Camille" }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: "Hi Camille" },
              { inlineData: { mimeType: "image/png", data: "AAAA" } },
            ],
          },
          { role: "model", parts: [{ functionCall: { name: "mail", args: { to: "Camille" } } }] },
          {
            role: "user",
            parts: [{ functionResponse: { name: "mail", response: { result: "Camille ok" } } }],
          },
        ],
      },
      mask,
    );
    expect(out.systemInstruction).toEqual({ parts: [{ text: "Serve Marc" }] });
    expect(out.contents).toEqual([
      {
        role: "user",
        parts: [{ text: "Hi Marc" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }],
      },
      { role: "model", parts: [{ functionCall: { name: "mail", args: { to: "Marc" } } }] },
      {
        role: "user",
        parts: [{ functionResponse: { name: "mail", response: { result: "Marc ok" } } }],
      },
    ]);
  });

  it("restores candidates' text for the reader and function-call args for the executor", () => {
    const out = restoreGenerateResponse(
      {
        candidates: [
          {
            index: 0,
            content: {
              role: "model",
              parts: [
                { text: "Hello Marc" },
                { functionCall: { name: "f", args: { who: "Marc" } } },
              ],
            },
          },
        ],
      },
      fns,
    );
    expect(out.candidates).toEqual([
      {
        index: 0,
        content: {
          role: "model",
          parts: [
            { text: "Hello Camille" },
            { functionCall: { name: "f", args: { who: "Camille" } } },
          ],
        },
      },
    ]);
  });
});

describe("Gemini stream rewriter", () => {
  const vault = { "Marc Charvet": "Camille Roussel" };
  const rfns = {
    reply: (t: string) => unredactReply(t, vault),
    args: (t: string) => unredactArgs(t, vault),
  };
  const frame = (text: string, finish?: string): SseFrame => ({
    data: JSON.stringify({
      candidates: [
        {
          index: 0,
          content: { role: "model", parts: [{ text }] },
          ...(finish ? { finishReason: finish } : {}),
        },
      ],
    }),
  });
  const texts = (frames: SseFrame[]) =>
    frames.map((f) =>
      (
        JSON.parse(f.data) as {
          candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
        }
      ).candidates[0].content.parts
        .map((p) => p.text ?? "")
        .join(""),
    );

  it("restores a name split across chunks and releases the tail on finishReason", () => {
    const rw = new GeminiStreamRewriter(vault, rfns);
    const out = [
      ...rw.rewrite(frame("Dear Marc ")),
      ...rw.rewrite(frame("Char")),
      ...rw.rewrite(frame("vet!", "STOP")),
    ];
    const pieces = texts(out);
    expect(pieces.join("")).toBe("Dear Camille Roussel!");
    for (const p of pieces) expect(p).not.toMatch(/Marc|Charvet/);
  });

  it("restores a function call part whole, in the same frame as text", () => {
    const rw = new GeminiStreamRewriter(vault, rfns);
    const f: SseFrame = {
      data: JSON.stringify({
        candidates: [
          {
            index: 0,
            content: {
              parts: [
                { text: "Calling " },
                { functionCall: { name: "f", args: { who: "Marc Charvet" } } },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    };
    const parts = (
      JSON.parse(rw.rewrite(f)[0].data) as { candidates: Array<{ content: { parts: unknown[] } }> }
    ).candidates[0].content.parts;
    expect(parts).toEqual([
      { text: "Calling " },
      { functionCall: { name: "f", args: { who: "Camille Roussel" } } },
    ]);
  });
});
