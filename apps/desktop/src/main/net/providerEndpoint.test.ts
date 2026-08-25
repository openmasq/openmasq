import { describe, expect, it } from "vitest";
import { decideProviderEndpoint } from "./providerEndpoint";
import { brandUrl } from "@openmasq/branding";

const GATEWAY = brandUrl("gw");

/**
 * Audit H1. The property under test is one sentence: **a key that came out of the encrypted
 * store never travels to an endpoint the renderer chose.** Everything else here is the proof
 * that enforcing it costs no legitimate path — the two `baseUrl` values that actually occur
 * (the baked gateway, an `openai-compat` endpoint) still behave exactly as before.
 */

const MAIN = { rendererSuppliedKey: false, packaged: true }; // key injected by withKey
const RENDERER = { rendererSuppliedKey: true, packaged: true }; // platform JWT / BYO key
const DEV = { rendererSuppliedKey: true, packaged: false };

describe("decideProviderEndpoint — a stored key never follows a renderer baseUrl", () => {
  // THE hole this exists for. `scaleway` was absent from the old CANONICAL_HOST_PROVIDERS
  // deny-list and is not `openai-compat`, so it fell between the two guards: a
  // `chat:complete` on it attached the stored `redactModel` key and sent it wherever the
  // renderer pointed. A deny-list cannot cover an id nobody thought of; this is why the
  // rule is now universal.
  it("drops the override for `scaleway` — the provider the old deny-list forgot", () => {
    const d = decideProviderEndpoint(
      { provider: "scaleway", apiKey: "sk-stored", baseUrl: "https://attacker.example/v1" },
      MAIN,
    );
    expect(d.baseUrl).toBeUndefined();
    expect(d.apiKey).toBe("sk-stored"); // still sent — to the provider's CANONICAL host
    expect(d.warn).toMatch(/canonical host/);
  });

  it("drops it for a provider id that does not exist yet (the rule is universal, not a list)", () => {
    const d = decideProviderEndpoint(
      { provider: "some-future-provider", apiKey: "sk-stored", baseUrl: "https://attacker.example/v1" },
      MAIN,
    );
    expect(d.baseUrl).toBeUndefined();
  });

  it.each(["openai", "anthropic", "google", "mistral", "deepseek", "openrouter"])(
    "keeps the historical H-2 behaviour for %s",
    (provider) => {
      const d = decideProviderEndpoint(
        { provider, apiKey: "sk-stored", baseUrl: "https://attacker.example/v1" },
        MAIN,
      );
      expect(d.baseUrl).toBeUndefined();
      expect(d.apiKey).toBe("sk-stored");
    },
  );
});

describe("decideProviderEndpoint — the legitimate paths are untouched", () => {
  // A platform send: the renderer supplies BOTH the Supabase JWT and the baked gateway URL.
  it("keeps the gateway for a platform send (renderer-supplied key)", () => {
    const d = decideProviderEndpoint(
      { provider: "anthropic", apiKey: "supabase-jwt", baseUrl: GATEWAY },
      RENDERER,
    );
    expect(d.baseUrl).toBe(GATEWAY);
    expect(d.apiKey).toBe("supabase-jwt");
    expect(d.warn).toBeUndefined();
  });

  // ⚠️ The pin that makes this change free: the DEV gateway is `http://localhost:8080`
  // (`apps/desktop/.env.development`). A blanket "public hosts only" would refuse every
  // platform send in `pnpm dev`. Packaged builds bake a public HTTPS gateway, so the
  // private-endpoint refusal below only ever fires on a call that cannot be legitimate.
  it("allows the LOCALHOST dev gateway when the build is not packaged", () => {
    const d = decideProviderEndpoint(
      { provider: "openrouter", apiKey: "supabase-jwt", baseUrl: "http://localhost:8080" },
      DEV,
    );
    expect(d.baseUrl).toBe("http://localhost:8080");
  });

  it("refuses an internal/private endpoint for a platform send in a PACKAGED build", () => {
    for (const baseUrl of ["http://169.254.169.254/", "http://192.168.1.10:8080", "http://localhost:8080"]) {
      expect(() =>
        decideProviderEndpoint({ provider: "openrouter", apiKey: "supabase-jwt", baseUrl }, RENDERER),
      ).toThrow(/interne\/privée/);
    }
  });

  it("passes a call with no baseUrl straight through", () => {
    const d = decideProviderEndpoint({ provider: "openai", apiKey: "sk-stored" }, MAIN);
    expect(d.baseUrl).toBeUndefined();
    expect(d.apiKey).toBe("sk-stored");
    expect(d.warn).toBeUndefined();
  });
});

describe("decideProviderEndpoint — openai-compat keeps its custom endpoint (M5 unchanged)", () => {
  it.each(["http://localhost:11434/v1", "http://192.168.1.50:11434/v1", "http://ollama.local/v1"])(
    "keeps BOTH the endpoint and the stored key for the local/LAN target %s",
    (baseUrl) => {
      const d = decideProviderEndpoint({ provider: "openai-compat", apiKey: "sk-stored", baseUrl }, MAIN);
      expect(d.baseUrl).toBe(baseUrl);
      expect(d.apiKey).toBe("sk-stored");
    },
  );

  it("drops the STORED key (never the endpoint) for a public openai-compat host", () => {
    const d = decideProviderEndpoint(
      { provider: "openai-compat", apiKey: "sk-stored", baseUrl: "https://attacker.example/v1" },
      MAIN,
    );
    expect(d.apiKey).toBeUndefined(); // fail closed: the request goes out WITHOUT the key
    expect(d.baseUrl).toBe("https://attacker.example/v1");
    expect(d.warn).toMatch(/M5/);
  });

  it("leaves a user's INLINE key alone on a public openai-compat host", () => {
    const d = decideProviderEndpoint(
      { provider: "openai-compat", apiKey: "user-typed", baseUrl: "https://api.together.xyz/v1" },
      RENDERER,
    );
    expect(d.apiKey).toBe("user-typed");
    expect(d.baseUrl).toBe("https://api.together.xyz/v1");
  });
});

describe("decideProviderEndpoint — scheme floor", () => {
  it.each(["file:///etc/passwd", "data:text/plain,x", "javascript:alert(1)", "not a url"])(
    "drops a non-http(s) baseUrl (%s)",
    (baseUrl) => {
      const d = decideProviderEndpoint({ provider: "openai-compat", apiKey: "k", baseUrl }, RENDERER);
      expect(d.baseUrl).toBeUndefined();
    },
  );
});
