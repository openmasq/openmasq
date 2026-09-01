import { describe, expect, it } from "vitest";
import { familyMark, modelMark } from "./marks";

describe("modelMark", () => {
  it("resolves an OpenRouter namespaced id by its vendor prefix (the pearl fix)", () => {
    // `anthropic/claude-sonnet` used to miss every substring rule → pearl. Now the
    // vendor prefix resolves it to the Claude glyph.
    expect(modelMark("openrouter", "anthropic/claude-sonnet-4")).toEqual({
      kind: "glyph",
      glyph: "claude",
    });
    expect(modelMark("openrouter", "openai/gpt-4o")).toEqual({ kind: "glyph", glyph: "chatgpt" });
    // A `~vendor` self-moderated endpoint folds to the base vendor.
    expect(modelMark("openrouter", "~anthropic/claude")).toEqual({ kind: "glyph", glyph: "claude" });
  });

  it("falls back to a simple-icons brand when there is no hand-inlined glyph", () => {
    const mark = modelMark("openrouter", "meta-llama/llama-3.3-70b");
    expect(mark.kind).toBe("brand");
    if (mark.kind === "brand") expect(mark.brand.path.length).toBeGreaterThan(0);
  });

  it("keeps the id's OWN vendor over the aggregator prefix", () => {
    // A namespaced id names ITS OWN vendor: the glyph follows the model, not the gateway.
    expect(modelMark("openrouter", "deepseek/deepseek-chat-v3.1")).toEqual({
      kind: "glyph",
      glyph: "deepseek",
    });
  });

  it("falls back to the provider glyph (pearl) for an unknown local model", () => {
    expect(modelMark("openai-compat", "some-local-model")).toEqual({ kind: "glyph", glyph: "pearl" });
  });
});

describe("familyMark", () => {
  it("returns a glyph for a core vendor family", () => {
    expect(familyMark("anthropic")).toEqual({ kind: "glyph", glyph: "claude" });
    expect(familyMark("moonshot")).toEqual({ kind: "glyph", glyph: "kimi" });
  });

  it("returns a brand for a simple-icons-only family", () => {
    expect(familyMark("meta")?.kind).toBe("brand");
    expect(familyMark("perplexity")?.kind).toBe("brand");
    expect(familyMark("openai-compat")?.kind).toBe("brand"); // Ollama, the "Local" family
  });

  it("returns a vendored icon for a family neither the glyph set nor simple-icons covers", () => {
    // Poolside/Tencent/Cohere all used to fall through to the pearl — the whole
    // OpenRouter long tail looked like one vendor.
    for (const key of ["poolside", "tencent", "cohere", "ibm-granite"]) {
      const mark = familyMark(key);
      expect(mark?.kind, key).toBe("image");
      if (mark?.kind === "image") expect(mark.logo.src.startsWith("data:image/"), key).toBe(true);
    }
  });

  it("returns null only for a vendor we truly hold no mark for (→ monogram)", () => {
    expect(familyMark("sao10k")).toBeNull();
    expect(familyMark("thedrummer")).toBeNull();
  });
});
