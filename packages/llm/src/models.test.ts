import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  MODELS,
  MODEL_PRICING,
  MODEL_CONTEXT,
  contextWindow,
  findModel,
  isPlatformProvider,
} from "./models";

describe("DeepSeek provider", () => {
  it("is registered as a BYO-key OpenAI-compatible provider (China-hosted)", () => {
    const p = PROVIDERS.deepseek;
    expect(p.id).toBe("deepseek");
    expect(p.keyUrl).toBeTruthy(); // BYO: a key page is shown
    expect(p.defaultBaseUrl).toBe("https://api.deepseek.com/v1");
    expect(p.hostCountry?.code).toBe("CN");
    expect(p.keyless).toBeUndefined();
    // DeepSeek est BYO-clé PERSONNELLE UNIQUEMENT : la plateforme ne le sert pas sur sa
    // propre clé, donc un envoi sans clé est refusé « Clé requise » — jamais facturé
    // à l'abonnement. Même règle pour OpenAI / Anthropic / Google / Mistral.
    expect(isPlatformProvider("deepseek")).toBe(false);
    for (const byo of ["openai", "anthropic", "google", "mistral"] as const) {
      expect(isPlatformProvider(byo), byo).toBe(false);
    }
  });

  it("registers v4-pro and v4-flash with 1M context + pricing + no vision", () => {
    for (const id of ["deepseek-v4-pro", "deepseek-v4-flash"]) {
      const model = findModel(id);
      expect(model, id).toBeDefined();
      expect(model!.provider).toBe("deepseek");
      expect(model!.vision).toBeFalsy(); // DeepSeek API is text-only
      expect(contextWindow(id)).toBe(1_000_000);
      expect(MODEL_CONTEXT[id]).toBe(1_000_000);
      expect(MODEL_PRICING[id]).toBeDefined();
      expect(MODEL_PRICING[id].in).toBeGreaterThan(0);
    }
  });
});

describe("OpenRouter provider", () => {
  it("is an OpenAI-compatible aggregator, BOTH BYO-key AND platform-eligible", () => {
    const p = PROVIDERS.openrouter;
    expect(p.id).toBe("openrouter");
    expect(p.keyUrl).toBeTruthy(); // still BYO-capable: a key page is shown
    expect(p.defaultBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(p.hostCountry?.code).toBe("global"); // multi-vendor: no single jurisdiction
    expect(p.keyless).toBeUndefined();
    // The platform now holds an OpenRouter key, so a KEYLESS send routes through the gateway
    // on the platform's credits (like OpenAI/DeepSeek) — only the curated `PLATFORM_MODELS`
    // ids; a user WITH their own key still routes DIRECT. The gateway allow-list is the
    // fail-closed boundary for which OpenRouter models are served on our key.
    expect(isPlatformProvider("openrouter")).toBe(true);
  });

  it("registers its curated models with pricing + context, wire id = registry id", () => {
    const models = MODELS.filter((m) => m.provider === "openrouter");
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(MODEL_PRICING[m.id], m.id).toBeDefined();
      expect(MODEL_CONTEXT[m.id], m.id).toBeGreaterThan(0);
    }
  });

  it("marks `:free` tiers at zero price (still key-gated, not credit-bypassed)", () => {
    const free = MODELS.filter((m) => m.provider === "openrouter" && m.id.endsWith(":free"));
    expect(free.length).toBeGreaterThan(0);
    for (const m of free) {
      expect(MODEL_PRICING[m.id]).toEqual({ in: 0, out: 0 });
    }
  });
});

describe("setDynamicModels change signal", () => {
  it("bumps the version and notifies subscribers on every merge", async () => {
    const { setDynamicModels, modelsVersion, onModelsChanged } = await import("./models/dynamic.js");
    const before = modelsVersion();
    let notified = 0;
    const off = onModelsChanged(() => notified++);
    // Merge over a provider id with no registry entries so the registry is unchanged.
    setDynamicModels("nonexistent-provider" as never, []);
    expect(modelsVersion()).toBe(before + 1);
    expect(notified).toBe(1);
    off();
    setDynamicModels("nonexistent-provider" as never, []);
    expect(modelsVersion()).toBe(before + 2);
    expect(notified).toBe(1); // unsubscribed — no further calls
  });
});
