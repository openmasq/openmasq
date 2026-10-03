import { describe, expect, it } from "vitest";
import { MODEL_CONTEXT } from "@openmasq/llm";
import { CONTEXT_REPLY_RESERVE, contextOverflow, formatTokenCount } from "./contextFit";

describe("contextOverflow", () => {
  it("refuses past the window minus the reply's room, counting the text and every file", () => {
    const limit = 128_000;
    const budget = limit - CONTEXT_REPLY_RESERVE;
    const atBudget = "a".repeat(budget * 4);
    expect(contextOverflow({ modelId: "gpt-4o", text: atBudget, files: [] })).toBeNull();
    expect(contextOverflow({ modelId: "gpt-4o", text: atBudget, files: [{ text: "abcd" }] })).toEqual({
      modelId: "gpt-4o",
      tokens: budget + 1,
      limit,
    });
  });

  // Documents ride WHOLE now: a payload between the window and 1.25× of it — which the
  // former margin let through to a provider refusal — is refused before masking.
  it("a whole document just over the window is refused, wherever its weight sits", () => {
    const limit = 128_000;
    const doc = "d".repeat(Math.ceil(limit * 1.1) * 4);
    expect(contextOverflow({ modelId: "gpt-4o", text: "Résume.", files: [{ text: doc }] })?.limit).toBe(limit);
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
