import { describe, expect, it } from "vitest";
import {
  maskChatRequest,
  maskEmbeddingsRequest,
  maskResponsesRequest,
  restoreChatResponse,
  restoreResponsesResponse,
} from "./wire";

const mask = async (t: string) => t.replace(/Camille/g, "Marc");
const fns = {
  reply: (t: string) => t.replace(/Marc/g, "Camille"),
  args: (t: string) => t.replace(/Marc/g, "Camille") + "",
};

describe("OpenAI wire — requests", () => {
  it("masks string and part contents, tool results and historic tool-call arguments", async () => {
    const body = {
      model: "gpt",
      messages: [
        { role: "system", content: "You help Camille." },
        {
          role: "user",
          content: [
            { type: "text", text: "Write to Camille" },
            { type: "image_url", image_url: { url: "x" } },
          ],
        },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: { name: "mail", arguments: '{"to":"Camille"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "c1", content: "Sent to Camille" },
      ],
    };
    const out = await maskChatRequest(body, mask);
    expect(out.messages).toEqual([
      { role: "system", content: "You help Marc." },
      {
        role: "user",
        content: [
          { type: "text", text: "Write to Marc" },
          { type: "image_url", image_url: { url: "x" } },
        ],
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "mail", arguments: '{"to":"Marc"}' } },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "Sent to Marc" },
    ]);
    expect(body.messages[0].content).toBe("You help Camille."); // input untouched
  });

  it("masks Responses input as a string, as items, and the instructions", async () => {
    const out = await maskResponsesRequest(
      {
        instructions: "Camille first",
        input: [
          { role: "user", content: [{ type: "input_text", text: "Hi Camille" }] },
          { type: "function_call_output", call_id: "c", output: "Camille ok" },
        ],
      },
      mask,
    );
    expect(out.instructions).toBe("Marc first");
    expect(out.input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "Hi Marc" }] },
      { type: "function_call_output", call_id: "c", output: "Marc ok" },
    ]);
    expect((await maskResponsesRequest({ input: "Camille" }, mask)).input).toBe("Marc");
  });

  it("masks embeddings input, string or list", async () => {
    expect((await maskEmbeddingsRequest({ input: "Camille" }, mask)).input).toBe("Marc");
    expect((await maskEmbeddingsRequest({ input: ["Camille", "x"] }, mask)).input).toEqual([
      "Marc",
      "x",
    ]);
  });
});

describe("OpenAI wire — replies", () => {
  it("restores the message text for the reader and the tool arguments for the executor", () => {
    const out = restoreChatResponse(
      {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Hi Marc",
              tool_calls: [{ function: { name: "f", arguments: '{"who":"Marc"}' } }],
            },
          },
        ],
      },
      fns,
    );
    const msg = (
      out.choices as Array<{
        message: { content: string; tool_calls: Array<{ function: { arguments: string } }> };
      }>
    )[0].message;
    expect(msg.content).toBe("Hi Camille");
    expect(msg.tool_calls[0].function.arguments).toBe('{"who":"Camille"}');
  });

  it("restores Responses output messages and function calls", () => {
    const out = restoreResponsesResponse(
      {
        output: [
          { type: "message", content: [{ type: "output_text", text: "Marc" }] },
          { type: "function_call", arguments: '{"a":"Marc"}' },
        ],
      },
      fns,
    );
    expect(out.output).toEqual([
      { type: "message", content: [{ type: "output_text", text: "Camille" }] },
      { type: "function_call", arguments: '{"a":"Camille"}' },
    ]);
  });
});
