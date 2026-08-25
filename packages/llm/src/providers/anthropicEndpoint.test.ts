import { describe, it, expect } from "vitest";
import { anthropicEndpoint } from "./anthropicEndpoint.js";
import { isPlatformProvider } from "../models/index.js";

describe("anthropicEndpoint — direct vs platform routing", () => {
  it("DIRECT (no baseUrl): api.anthropic.com with x-api-key, no bearer", () => {
    const { url, headers } = anthropicEndpoint("sk-ant-user-key");
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("sk-ant-user-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.Authorization).toBeUndefined();
  });

  it("PLATFORM (baseUrl set = platform gateway): Bearer JWT to gateway, NO provider key", () => {
    const { url, headers } = anthropicEndpoint("supabase.jwt.token", "https://gw.acme.example");
    expect(url).toBe("https://gw.acme.example/v1/messages");
    expect(headers.Authorization).toBe("Bearer supabase.jwt.token");
    // The gateway holds the platform's real key — the client must NOT leak a provider key.
    expect(headers["x-api-key"]).toBeUndefined();
    expect(headers["anthropic-version"]).toBeUndefined();
  });

  it("trims a trailing slash on the gateway base", () => {
    expect(anthropicEndpoint("jwt", "https://gw.acme.example/").url).toBe(
      "https://gw.acme.example/v1/messages",
    );
  });
});

describe("isPlatformProvider — platform-eligible providers", () => {
  it("est EXACTEMENT Scaleway (abonnement) + OpenRouter (clé OU abonnement)", () => {
    for (const p of ["scaleway", "openrouter"] as const)
      expect(isPlatformProvider(p)).toBe(true);
  });
  it("exclut les BYO-clé-personnelle, le local et les sessions sans clé", () => {
    // Les cinq grands ne sont PLUS servis sur les clés de la plateforme : sans clé
    // personnelle, l'envoi est refusé, jamais facturé à l'abonnement.
    for (const p of ["openai", "anthropic", "google", "mistral", "deepseek",
                     "openai-compat", "openai-session", "anthropic-session"] as const)
      expect(isPlatformProvider(p)).toBe(false);
  });
});
