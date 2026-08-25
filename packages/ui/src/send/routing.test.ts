import { describe, it, expect } from "vitest";
import { isPlatformProvider, MODELS, PLATFORM_OPENROUTER_IDS, PROVIDERS } from "@openmasq/llm";
import { completeRouting, resolveEffectivePlatform } from "./routing";

// Discover a real platform + non-platform provider from the live registry, so the
// test stays honest if the platform set changes. The model id is a REAL registry id
// of that provider — the decision is model-aware (OpenRouter below).
const ids = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];
const PLATFORM = ids.find((p) => isPlatformProvider(p))!;
const NON_PLATFORM = ids.find((p) => !isPlatformProvider(p))!;
const PLATFORM_MODEL = MODELS.find((m) => m.provider === PLATFORM)!.id;
const NON_PLATFORM_MODEL = MODELS.find((m) => m.provider === NON_PLATFORM)?.id ?? "any-model";

describe("resolveEffectivePlatform", () => {
  it("platform provider with NO personal key ⇒ routes through the gateway (true)", () => {
    expect(resolveEffectivePlatform(PLATFORM, PLATFORM_MODEL, undefined, new Set())).toBe(true);
  });

  it("platform provider WITH a personal key (byo/default mode) ⇒ direct (false)", () => {
    expect(resolveEffectivePlatform(PLATFORM, PLATFORM_MODEL, undefined, new Set([PLATFORM]))).toBe(false);
    expect(resolveEffectivePlatform(PLATFORM, PLATFORM_MODEL, "byo", new Set([PLATFORM]))).toBe(false);
  });

  it("billingMode 'subscription' FORCES the gateway even when a key exists (true)", () => {
    expect(resolveEffectivePlatform(PLATFORM, PLATFORM_MODEL, "subscription", new Set([PLATFORM]))).toBe(true);
  });

  it("a NON-platform provider is never routed through the gateway, regardless of mode/key", () => {
    expect(resolveEffectivePlatform(NON_PLATFORM, NON_PLATFORM_MODEL, "subscription", new Set())).toBe(false);
    expect(resolveEffectivePlatform(NON_PLATFORM, NON_PLATFORM_MODEL, undefined, new Set())).toBe(false);
    expect(resolveEffectivePlatform(NON_PLATFORM, NON_PLATFORM_MODEL, "byo", new Set([NON_PLATFORM]))).toBe(false);
  });

  // The decision is MODEL-aware for OpenRouter: the gateway allow-lists only the
  // curated STATIC registry ids — a dynamically-discovered slug routed there 400s
  // MODEL_NOT_ALLOWED, so it must resolve BYO even keyless (fail closed).
  it("a CURATED OpenRouter id, keyless ⇒ gateway (true)", () => {
    expect(PLATFORM_OPENROUTER_IDS.length).toBeGreaterThan(0);
    expect(
      resolveEffectivePlatform("openrouter", PLATFORM_OPENROUTER_IDS[0], undefined, new Set()),
    ).toBe(true);
  });

  it("a DYNAMIC OpenRouter slug is NEVER platform-routed, even keyless (false)", () => {
    const dynamicSlug = "anthropic/claude-3-haiku"; // catalogue slug, not in the static registry
    expect(PLATFORM_OPENROUTER_IDS).not.toContain(dynamicSlug);
    expect(resolveEffectivePlatform("openrouter", dynamicSlug, undefined, new Set())).toBe(false);
    expect(resolveEffectivePlatform("openrouter", dynamicSlug, "subscription", new Set())).toBe(false);
  });
});

describe("completeRouting — an out-of-band completion routes like a send", () => {
  const base = { inferenceUrl: "https://gw.example", token: "jwt-123", openaiCompatBaseUrl: "http://localhost:11434/v1" };

  it("a keyless PLATFORM model → the gateway (JWT as key, inferenceUrl as base)", () => {
    // This is the DEFAULT OpenRouter `:free` case — the bug was these two fields being absent.
    expect(completeRouting(PLATFORM, PLATFORM_MODEL, { billingMode: undefined, keyConfigured: new Set(), ...base })).toEqual({
      apiKey: "jwt-123",
      baseUrl: "https://gw.example",
    });
  });

  it("a platform route with a missing URL or token THROWS (fail closed → caller retries)", () => {
    expect(() =>
      completeRouting(PLATFORM, PLATFORM_MODEL, { billingMode: undefined, keyConfigured: new Set(), ...base, token: undefined }),
    ).toThrow();
    expect(() =>
      completeRouting(PLATFORM, PLATFORM_MODEL, { billingMode: undefined, keyConfigured: new Set(), ...base, inferenceUrl: undefined }),
    ).toThrow();
  });

  it("a platform model WITH a personal key → direct (no gateway routing, main injects the key)", () => {
    expect(completeRouting(PLATFORM, PLATFORM_MODEL, { billingMode: "byo", keyConfigured: new Set([PLATFORM]), ...base })).toEqual({});
  });

  it("a DYNAMIC OpenRouter slug → direct (never the gateway, which would 400 it)", () => {
    expect(
      completeRouting("openrouter", "anthropic/claude-3-haiku", { billingMode: undefined, keyConfigured: new Set(), ...base }),
    ).toEqual({});
  });

  it("openai-compat → its configured local endpoint", () => {
    expect(completeRouting("openai-compat", "llama3.3", { billingMode: undefined, keyConfigured: new Set(), ...base })).toEqual({
      baseUrl: "http://localhost:11434/v1",
    });
  });
});
