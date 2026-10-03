import { describe, expect, it } from "vitest";
import { MODEL_CONTEXT } from "@openmasq/llm";
import { CONTEXT_REFUSE_MARGIN, contextOverflow, formatTokenCount } from "./contextFit";

describe("contextOverflow", () => {
  it("refuses only past the margin, counting the text and every file", () => {
    const limit = 128_000;
    const atLimit = "a".repeat(limit * CONTEXT_REFUSE_MARGIN * 4);
    expect(contextOverflow({ modelId: "gpt-4o", text: atLimit, files: [] })).toBeNull();
    expect(contextOverflow({ modelId: "gpt-4o", text: atLimit, files: [{ text: "abcd" }] })).toEqual({
      modelId: "gpt-4o",
      tokens: limit * CONTEXT_REFUSE_MARGIN + 1,
      limit,
    });
  });
});

describe("formatTokenCount — the picker's window figure, unchanged", () => {
  it("prints every registry window exactly as the model card did", () => {
    const card = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1_000)}K`);
    for (const n of Object.values(MODEL_CONTEXT)) expect(formatTokenCount(n)).toBe(card(n));
  });
  it("rounds an estimate", () => {
    expect(formatTokenCount(1_234_567)).toBe("1.23M");
    expect(formatTokenCount(199_600)).toBe("200K");
    expect(formatTokenCount(812)).toBe("812");
  });
});
