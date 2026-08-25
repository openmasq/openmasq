import { describe, expect, it } from "vitest";
import type { McpTool } from "../types";
import {
  parseAnthropicToolUse,
  parseOpenAIToolCall,
  providerFamily,
  toAnthropicTools,
  toOpenAITools,
  toProviderTools,
} from "./index";

const tools: McpTool[] = [
  {
    name: "gmail__search",
    description: "Search mail",
    inputSchema: { type: "object", properties: { q: { type: "string" } } },
    serverId: "gmail",
  },
];

describe("provider adapters", () => {
  it("maps ProviderId to a tool dialect", () => {
    expect(providerFamily("anthropic")).toBe("anthropic");
    expect(providerFamily("anthropic-session")).toBe("anthropic");
    expect(providerFamily("openai")).toBe("openai");
    expect(providerFamily("mistral")).toBe("openai");
    expect(providerFamily("google")).toBe("openai");
  });

  it("emits Anthropic input_schema tools", () => {
    const [t] = toAnthropicTools(tools);
    expect(t).toEqual({
      name: "gmail__search",
      description: "Search mail",
      input_schema: tools[0].inputSchema,
    });
  });

  it("emits OpenAI/Mistral function tools", () => {
    const [t] = toOpenAITools(tools);
    expect(t.type).toBe("function");
    expect(t.function.name).toBe("gmail__search");
    expect(t.function.parameters).toEqual(tools[0].inputSchema);
  });

  it("dispatches via toProviderTools", () => {
    expect(toProviderTools("anthropic", tools)).toEqual(toAnthropicTools(tools));
    expect(toProviderTools("openai", tools)).toEqual(toOpenAITools(tools));
  });

  it("parses an Anthropic tool_use block", () => {
    const call = parseAnthropicToolUse({
      type: "tool_use",
      id: "tu_1",
      name: "gmail__search",
      input: { q: "hi" },
    });
    expect(call).toEqual({ id: "tu_1", name: "gmail__search", arguments: { q: "hi" } });
  });

  it("parses an OpenAI tool call (arguments are a JSON string)", () => {
    const call = parseOpenAIToolCall({
      id: "call_1",
      type: "function",
      function: { name: "gmail__search", arguments: '{"q":"hi"}' },
    });
    expect(call).toEqual({ id: "call_1", name: "gmail__search", arguments: { q: "hi" } });
  });

  it("tolerates malformed OpenAI tool arguments", () => {
    const call = parseOpenAIToolCall({
      id: "call_2",
      type: "function",
      function: { name: "gmail__search", arguments: "not json" },
    });
    expect(call.arguments).toEqual({});
  });
});
