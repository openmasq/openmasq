import { describe, expect, it } from "vitest";
import { maskMessagesRequest, restoreMessagesResponse } from "./wire";

const mask = async (t: string) => t.replace(/Camille/g, "Marc");
const fns = {
  reply: (t: string) => t.replace(/Marc/g, "Camille"),
  args: (t: string) => t.replace(/Marc/g, "Camille"),
};

describe("Anthropic wire", () => {
  it("masks system (string or blocks), text, tool results and tool-use inputs", async () => {
    const out = await maskMessagesRequest(
      {
        system: [{ type: "text", text: "Serve Camille" }],
        messages: [
          { role: "user", content: "Hi Camille" },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t",
                name: "mail",
                input: { to: "Camille", nested: ["Camille"] },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t",
                content: [{ type: "text", text: "Camille done" }],
              },
            ],
          },
        ],
      },
      mask,
    );
    expect(out.system).toEqual([{ type: "text", text: "Serve Marc" }]);
    expect(out.messages).toEqual([
      { role: "user", content: "Hi Marc" },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t", name: "mail", input: { to: "Marc", nested: ["Marc"] } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t", content: [{ type: "text", text: "Marc done" }] },
        ],
      },
    ]);
    expect((await maskMessagesRequest({ system: "Camille" }, mask)).system).toBe("Marc");
  });

  it("restores text blocks for the reader and tool_use inputs for the executor", () => {
    const out = restoreMessagesResponse(
      {
        content: [
          { type: "text", text: "Hello Marc" },
          { type: "tool_use", id: "t", name: "f", input: { who: "Marc" } },
        ],
      },
      fns,
    );
    expect(out.content).toEqual([
      { type: "text", text: "Hello Camille" },
      { type: "tool_use", id: "t", name: "f", input: { who: "Camille" } },
    ]);
  });
});
