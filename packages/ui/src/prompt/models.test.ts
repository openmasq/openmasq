import { describe, expect, it } from "vitest";
import { findModelAny, modelDisplay } from "./models";

describe("modelDisplay — the « gratuit » badge + label", () => {
  it("flags a zero-priced model and drops the redundant '(gratuit)' label suffix", () => {
    const free = findModelAny("poolside/laguna-s-2.1:free")!;
    expect(modelDisplay(free)).toEqual({ label: "Laguna S 2.1", free: true });
    const orFree = findModelAny("openai/gpt-oss-20b:free")!;
    expect(modelDisplay(orFree)).toEqual({ label: "GPT-OSS 20B", free: true });
  });

  it("a paid model keeps its label verbatim, no badge", () => {
    const paid = findModelAny("claude-sonnet-5")! ?? findModelAny("gpt-5.5")!;
    const d = modelDisplay(paid);
    expect(d.free).toBe(false);
    expect(d.label).toBe(paid.label);
  });
});
