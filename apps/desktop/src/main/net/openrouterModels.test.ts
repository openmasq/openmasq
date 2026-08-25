import { describe, it, expect } from "vitest";
import { normalizeOpenRouterModels } from "./openrouterModels";

const RAW = {
  data: [
    {
      id: "x-ai/grok-4.20",
      name: "xAI: Grok 4.20",
      context_length: 2_000_000,
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
      pricing: { prompt: "0.00000125", completion: "0.0000025" },
    },
    {
      id: "nvidia/nemotron-3-ultra:free",
      name: "NVIDIA: Nemotron 3 Ultra (free)",
      context_length: 1_000_000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "0", completion: "0" },
    },
    {
      // Music model: text OUT but also audio → dropped (media output).
      id: "google/lyria-3-pro",
      name: "Google: Lyria 3 Pro",
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text", "audio"] },
      pricing: { prompt: "0", completion: "0" },
    },
    {
      // Meta-router → dropped (opaque routing, meaningless price/context).
      id: "openrouter/auto",
      name: "Auto Router",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "0", completion: "0" },
    },
    {
      id: "no-id-should-be-skipped",
      // missing name is fine, but this one has an id — keep. Actually give it text/text.
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "0.0000004", completion: "0.0000004" },
    },
  ],
};

describe("normalizeOpenRouterModels", () => {
  it("keeps chat models, drops media-output + meta-routers, normalizes shape", () => {
    const out = normalizeOpenRouterModels(RAW);
    const ids = out.map((m) => m.id);
    expect(ids).not.toContain("google/lyria-3-pro"); // audio out → dropped
    expect(ids).not.toContain("openrouter/auto"); // meta-router → dropped
    expect(ids).toContain("x-ai/grok-4.20");
    expect(ids).toContain("nvidia/nemotron-3-ultra:free");
    // every kept model is tagged as the openrouter provider
    expect(out.every((m) => m.provider === "openrouter")).toBe(true);
  });

  it("cleans the label: strips the vendor prefix and localises the free suffix", () => {
    const out = normalizeOpenRouterModels(RAW);
    const grok = out.find((m) => m.id === "x-ai/grok-4.20")!;
    const free = out.find((m) => m.id === "nvidia/nemotron-3-ultra:free")!;
    expect(grok.label).toBe("Grok 4.20");
    expect(free.label).toBe("Nemotron 3 Ultra (gratuit)");
  });

  it("converts per-token USD to per-1M and flags vision from image input", () => {
    const out = normalizeOpenRouterModels(RAW);
    const grok = out.find((m) => m.id === "x-ai/grok-4.20")!;
    expect(grok.pricing).toEqual({ in: 1.25, out: 2.5 });
    expect(grok.vision).toBe(true);
    expect(grok.contextTokens).toBe(2_000_000);
    const free = out.find((m) => m.id === "nvidia/nemotron-3-ultra:free")!;
    expect(free.pricing).toEqual({ in: 0, out: 0 });
    expect(free.vision).toBeUndefined(); // text-only
  });

  it("sorts cheapest-first so free models lead", () => {
    const out = normalizeOpenRouterModels(RAW);
    expect(out[0].pricing).toEqual({ in: 0, out: 0 });
  });

  it("throws on an unexpected shape (caller keeps the static baseline)", () => {
    expect(() => normalizeOpenRouterModels({ nope: true })).toThrow();
  });
});
