import { describe, it, expect } from "vitest";
import { deltaReasoning, reasoningFallback } from "./reasoning.js";

describe("deltaReasoning", () => {
  it("reads reasoning_content (DeepSeek) and reasoning (OpenRouter)", () => {
    expect(deltaReasoning({ reasoning_content: "abc" })).toBe("abc");
    expect(deltaReasoning({ reasoning: "xyz" })).toBe("xyz");
    expect(deltaReasoning({ reasoning_content: "a", reasoning: "b" })).toBe("a"); // rc wins
  });
  it("ignores content-only / empty / absent / non-string", () => {
    expect(deltaReasoning({ content: "hi" })).toBeUndefined();
    expect(deltaReasoning({ reasoning_content: "" })).toBeUndefined();
    expect(deltaReasoning(undefined)).toBeUndefined();
    expect(deltaReasoning({ reasoning: 42 })).toBeUndefined();
  });

  it("reads OpenRouter reasoning_details (o-series/GPT-5.x : `reasoning` reste null)", () => {
    // Journal 02/08: gpt-5.6's reasoning via OpenRouter arrives in typed
    // blocks — without this reading, nothing displayed during the whole think and
    // the turn read as "not streamed".
    expect(
      deltaReasoning({
        reasoning: null,
        reasoning_details: [{ type: "reasoning.summary", summary: "Je compare les bilans. " }],
      }),
    ).toBe("Je compare les bilans. ");
    expect(
      deltaReasoning({
        reasoning_details: [
          { type: "reasoning.text", text: "étape 1 " },
          { type: "reasoning.summary", summary: "étape 2" },
        ],
      }),
    ).toBe("étape 1 étape 2");
    // An encrypted block (data) has nothing displayable; neither does an empty array.
    expect(
      deltaReasoning({ reasoning_details: [{ type: "reasoning.encrypted", data: "…" }] }),
    ).toBeUndefined();
    expect(deltaReasoning({ reasoning_details: [] })).toBeUndefined();
    // The string field keeps priority — a text is never counted twice.
    expect(
      deltaReasoning({ reasoning: "x", reasoning_details: [{ type: "reasoning.text", text: "x" }] }),
    ).toBe("x");
  });
});

describe("reasoningFallback", () => {
  it("strips <think> markers and trims", () => {
    expect(reasoningFallback("<think>  Voici l'analyse </think>")).toBe("Voici l'analyse");
    expect(reasoningFallback("  plain thoughts  ")).toBe("plain thoughts");
  });
  it("returns empty when nothing usable remains", () => {
    expect(reasoningFallback("<think></think>")).toBe("");
    expect(reasoningFallback("   ")).toBe("");
  });
});
