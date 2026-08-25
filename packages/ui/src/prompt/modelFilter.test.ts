import { describe, expect, it } from "vitest";
import type { ModelInfo } from "@openmasq/llm";
import { filterModels, modelFamilies, modelFamily, modelPriceTier, subgroupByFamily } from "./modelFilter";

const m = (id: string, label: string, provider: ModelInfo["provider"]): ModelInfo => ({
  id,
  label,
  provider,
});

const MODELS: ModelInfo[] = [
  m("gpt-5.5", "GPT-5.5", "openai"),
  m("claude-opus-4.8", "Opus 4.8", "anthropic"),
  m("openai/gpt-4o", "GPT-4o", "openrouter"),
  m("openai/gpt-4o-mini", "GPT-4o mini", "openrouter"),
  m("anthropic/claude-sonnet-4", "Claude Sonnet 4", "openrouter"),
  m("meta-llama/llama-3.3-70b", "Llama 3.3 70B", "openrouter"),
  m("x-ai/grok-4", "Grok 4", "openrouter"),
];

describe("modelFamily", () => {
  it("derives the vendor from a namespaced OpenRouter id", () => {
    expect(modelFamily(m("openai/gpt-4o", "x", "openrouter"))).toEqual({
      key: "openai",
      label: "OpenAI",
    });
    // Native OpenAI folds into the SAME family as `openai/*`.
    expect(modelFamily(m("gpt-5.5", "x", "openai")).key).toBe("openai");
  });

  it("collapses vendor-spelling variants to one canonical family", () => {
    // OpenRouter's `mistralai` and the native `mistral` provider are ONE chip.
    expect(modelFamily(m("mistralai/mistral-large", "x", "openrouter")).key).toBe("mistral");
    expect(modelFamily(m("mistral-large-2512", "x", "mistral")).key).toBe("mistral");
    // `meta-llama` → meta, `x-ai` → xai.
    expect(modelFamily(m("meta-llama/x", "x", "openrouter"))).toEqual({ key: "meta", label: "Meta" });
    expect(modelFamily(m("x-ai/grok-4", "x", "openrouter"))).toEqual({ key: "xai", label: "xAI" });
    // A `~vendor` self-moderated endpoint folds into the base vendor.
    expect(modelFamily(m("~anthropic/claude", "x", "openrouter")).key).toBe("anthropic");
    expect(modelFamily(m("~openai/gpt", "x", "openrouter")).key).toBe("openai");
  });

  it("reads the vendor from the NAME for a prefix-less platform model (Scaleway)", () => {
    // Scaleway carries no prefix — the id IS the model name (GLM/Qwen/Gemma/Mistral).
    expect(modelFamily(m("glm-5.2", "GLM-5.2", "scaleway"))).toEqual({ key: "z-ai", label: "Z.AI" });
    expect(modelFamily(m("qwen3.6-35b", "Qwen3.6 35B", "scaleway")).key).toBe("qwen");
    expect(modelFamily(m("gemma-4-26b", "Gemma 4 26B", "scaleway")).key).toBe("google");
    expect(modelFamily(m("mistral-medium-2508", "Mistral Medium", "scaleway")).key).toBe("mistral");
  });

  it("falls back to the provider's HOUSE family for an unrecognised platform model", () => {
    expect(modelFamily(m("some-house-model", "House", "scaleway")).key).toBe("scaleway");
  });

  it("title-cases an unknown slug", () => {
    expect(modelFamily(m("acme-labs/x", "x", "openrouter")).label).toBe("Acme Labs");
  });
});

describe("modelFamilies", () => {
  it("counts distinct families, most-populated first", () => {
    const fams = modelFamilies(MODELS);
    expect(fams[0]).toMatchObject({ key: "openai", count: 3 }); // 2 OR + 1 native
    expect(fams.find((f) => f.key === "anthropic")?.count).toBe(2);
  });

  it("merges spelling variants into one counted family", () => {
    const fams = modelFamilies([
      m("mistral-large-2512", "x", "mistral"),
      m("mistralai/mistral-small", "x", "openrouter"),
      m("~anthropic/claude", "x", "openrouter"),
      m("anthropic/claude-sonnet", "x", "openrouter"),
    ]);
    expect(fams.find((f) => f.key === "mistral")?.count).toBe(2);
    expect(fams.find((f) => f.key === "anthropic")?.count).toBe(2);
    // No duplicate "Mistral" label from `mistralai`.
    expect(fams.filter((f) => f.label === "Mistral")).toHaveLength(1);
  });

  it("hides one-off vendors below minCount", () => {
    const fams = modelFamilies(MODELS, 2);
    expect(fams.map((f) => f.key)).not.toContain("xai"); // only 1 grok
    expect(fams.map((f) => f.key)).not.toContain("meta");
    expect(fams.map((f) => f.key)).toContain("openai");
  });
});

describe("subgroupByFamily", () => {
  it("partitions a provider group into families, most-populated first, order kept within", () => {
    const subs = subgroupByFamily(MODELS);
    expect(subs[0]).toMatchObject({ key: "openai", label: "OpenAI" });
    expect(subs[0].models.map((m) => m.id)).toEqual(["gpt-5.5", "openai/gpt-4o", "openai/gpt-4o-mini"]);
    expect(subs.find((s) => s.key === "anthropic")?.models).toHaveLength(2);
    // Single-model families are present (the caller decides whether to show a header).
    expect(subs.find((s) => s.key === "meta")?.models.map((m) => m.id)).toEqual(["meta-llama/llama-3.3-70b"]);
  });

  it("a single-family group yields ONE subgroup (caller renders it flat)", () => {
    const subs = subgroupByFamily([
      m("gpt-5.5", "GPT-5.5", "openai"),
      m("gpt-5.4", "GPT-5.4", "openai"),
    ]);
    expect(subs).toHaveLength(1);
    expect(subs[0].key).toBe("openai");
  });
});

describe("filterModels", () => {
  it("returns everything for an empty query + no family", () => {
    expect(filterModels(MODELS, "", null)).toHaveLength(MODELS.length);
  });

  it("matches a product-line query against the id even when the chip is the vendor", () => {
    const gpt = filterModels(MODELS, "gpt", null);
    expect(gpt.map((x) => x.id).sort()).toEqual(["gpt-5.5", "openai/gpt-4o", "openai/gpt-4o-mini"]);
    // "claude" hits the anthropic ids/labels.
    expect(filterModels(MODELS, "claude", null).length).toBe(2);
  });

  it("ANDs the family filter with the query", () => {
    // family=openai drops the native + OR OpenAI models only.
    expect(filterModels(MODELS, "", "openai").map((x) => x.id)).toEqual([
      "gpt-5.5",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
    ]);
    // family=anthropic + query "sonnet" narrows to one.
    expect(filterModels(MODELS, "sonnet", "anthropic").map((x) => x.id)).toEqual([
      "anthropic/claude-sonnet-4",
    ]);
    // A query that matches nothing in the family yields nothing.
    expect(filterModels(MODELS, "grok", "openai")).toHaveLength(0);
  });

  it("is accent-insensitive", () => {
    expect(filterModels([m("x", "Modèle Éclair", "openai")], "modele eclair", null)).toHaveLength(1);
  });
});

describe("modelPriceTier", () => {
  // Buckets read the LIVE registry pricing (USD / 1M output tokens):
  // free = explicit {0,0} · eco ≤ 3 · standard ≤ 20 · premium above.
  it("buckets on the output price, free only when explicitly zero-priced", () => {
    expect(modelPriceTier("nvidia/nemotron-3-ultra-550b-a55b:free")).toBe("free");
    expect(modelPriceTier("gpt-4o-mini")).toBe("eco"); // out 0.6
    expect(modelPriceTier("gpt-5.4")).toBe("standard"); // out 15
    expect(modelPriceTier("gpt-5.5")).toBe("premium"); // out 30
  });

  it("returns null for an UNKNOWN price — never guessed into a bucket", () => {
    expect(modelPriceTier("some/unpriced-model")).toBeNull();
  });

  it("filterModels ANDs the price tier with query + family", () => {
    const priced = [m("gpt-5.5", "GPT-5.5", "openai"), m("gpt-4o-mini", "GPT-4o mini", "openai")];
    expect(filterModels(priced, "", null, "premium").map((x) => x.id)).toEqual(["gpt-5.5"]);
    expect(filterModels(priced, "mini", "openai", "eco").map((x) => x.id)).toEqual(["gpt-4o-mini"]);
    expect(filterModels(priced, "mini", null, "premium")).toHaveLength(0);
  });
});
