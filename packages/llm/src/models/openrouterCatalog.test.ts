import { describe, it, expect } from "vitest";
import { normalizeOpenRouterModels } from "./openrouterCatalog.js";
import { setDynamicModels } from "./dynamic.js";
import { isPlatformServableModel } from "./capabilities.js";
import { MODEL_PRICING } from "./pricing.js";
import { PLATFORM_OPENROUTER_IDS } from "./registry.js";

// `isPlatformServableModel` is what decides, on BOTH sides of the platform boundary,
// whether the platform's own OpenRouter key may run a model: the picker greys on it, the send
// gate refuses on it, and `apps/gateway` allow-lists on it. For an aggregator whose
// catalogue is discovered at runtime, the invariant that matters is that "servable"
// can never outrun "priced" — the gateway meters from `MODEL_PRICING`, so an
// unpriced-but-served id would be inference nobody is charged for.

const catalogue = (
  models: { id: string; prompt?: string; completion?: string; out?: string[] }[],
): unknown => ({
  data: models.map((m) => ({
    id: m.id,
    name: `Vendor: ${m.id}`,
    context_length: 128000,
    architecture: { input_modalities: ["text"], output_modalities: m.out ?? ["text"] },
    pricing: { prompt: m.prompt ?? "0.000001", completion: m.completion ?? "0.000002" },
    supported_parameters: ["tools"],
  })),
});

/** Le minimum qu'une entrée doit porter pour être un modèle de CHAT (texte → texte). */
const TEXT = {
  context_length: 128000,
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  pricing: { prompt: "0.000001", completion: "0.000002" },
  supported_parameters: ["tools"],
};

describe("normalizeOpenRouterModels", () => {
  it("converts per-token USD to per-1M and keeps the id as the wire id", () => {
    const [m] = normalizeOpenRouterModels(catalogue([{ id: "vendor/model-a", prompt: "0.0000002", completion: "0.0000008" }]));
    expect(m).toMatchObject({ id: "vendor/model-a", provider: "openrouter", pricing: { in: 0.2, out: 0.8 } });
  });

  it("drops the opaque `openrouter/*` meta-routers and non-text-output models", () => {
    const ids = normalizeOpenRouterModels(
      catalogue([
        { id: "openrouter/auto" },
        { id: "vendor/music", out: ["text", "audio"] },
        { id: "vendor/chat" },
      ]),
    ).map((m) => m.id);
    // A meta-router bills for whatever it secretly routed to; a media model isn't chat.
    expect(ids).toEqual(["vendor/chat"]);
  });

  it("drops the BATCH variants — by id suffix AND by label", () => {
    const raw = {
      data: [
        { id: "anthropic/claude-opus-5:batch", name: "Claude Opus 5 (batch)", ...TEXT },
        // Le marqueur d'id sans le libellé, et l'inverse : chacun suffit à refuser.
        { id: "openai/gpt-5.6-luna:batch", name: "OpenAI: GPT-5.6 Luna", ...TEXT },
        { id: "vendor/deferred", name: "Vendor: Deferred (batch)", ...TEXT },
        { id: "anthropic/claude-opus-5", name: "Claude Opus 5", ...TEXT },
        // ⚠️ « batch » AILLEURS que dans la marque de variante n'est pas un motif de refus.
        { id: "vendor/batchelor-7b", name: "Vendor: Batchelor 7B", ...TEXT },
      ],
    };
    // Trié : la sortie est ordonnée par prix puis libellé, ce que ce cas ne juge pas.
    const ids = normalizeOpenRouterModels(raw).map((m) => m.id).sort();
    expect(ids).toEqual(["anthropic/claude-opus-5", "vendor/batchelor-7b"]);
  });

  it("throws on a malformed payload rather than yielding an empty catalogue", () => {
    // Callers treat a throw as "keep the previous surface"; a silent [] would REPLACE
    // the curated baseline with nothing.
    expect(() => normalizeOpenRouterModels({ nope: true })).toThrow();
  });
});

describe("isPlatformServableModel — OpenRouter (allow-list ⇄ price list)", () => {
  it("serves only the curated static ids before any catalogue is merged", () => {
    for (const id of PLATFORM_OPENROUTER_IDS) {
      expect(isPlatformServableModel("openrouter", id), id).toBe(true);
    }
    expect(isPlatformServableModel("openrouter", "vendor/discovered-later")).toBe(false);
  });

  it("serves a discovered slug once the catalogue is merged — and prices it", () => {
    setDynamicModels("openrouter", normalizeOpenRouterModels(catalogue([{ id: "vendor/fresh" }])));
    expect(isPlatformServableModel("openrouter", "vendor/fresh")).toBe(true);
    // The whole point: it is servable BECAUSE we know what to charge for it.
    expect(MODEL_PRICING["vendor/fresh"]).toEqual({ in: 1, out: 2 });
  });

  it("refuses an id the merged catalogue never listed", () => {
    setDynamicModels("openrouter", normalizeOpenRouterModels(catalogue([{ id: "vendor/fresh" }])));
    expect(isPlatformServableModel("openrouter", "vendor/never-seen")).toBe(false);
  });

  it("refuses a registered OpenRouter id carrying NO price (would meter zero)", () => {
    setDynamicModels("openrouter", normalizeOpenRouterModels(catalogue([{ id: "vendor/fresh" }])));
    delete MODEL_PRICING["vendor/fresh"];
    expect(isPlatformServableModel("openrouter", "vendor/fresh")).toBe(false);
  });

  it("keeps a curated id servable after the merge retired it upstream", () => {
    // The merge REPLACES every OpenRouter row, so a curated id OpenRouter has dropped
    // loses its registry entry — it must not lose platform access with it.
    const retired = PLATFORM_OPENROUTER_IDS[0];
    setDynamicModels("openrouter", normalizeOpenRouterModels(catalogue([{ id: "vendor/fresh" }])));
    expect(isPlatformServableModel("openrouter", retired)).toBe(true);
  });

  it("a `:free` tier is priced {0,0} — that IS a price, so it stays servable", () => {
    setDynamicModels(
      "openrouter",
      normalizeOpenRouterModels(catalogue([{ id: "vendor/gift:free", prompt: "0", completion: "0" }])),
    );
    expect(MODEL_PRICING["vendor/gift:free"]).toEqual({ in: 0, out: 0 });
    expect(isPlatformServableModel("openrouter", "vendor/gift:free")).toBe(true);
  });

  it("never makes a non-platform provider servable", () => {
    expect(isPlatformServableModel("openai-compat", "anything")).toBe(false);
  });
});
