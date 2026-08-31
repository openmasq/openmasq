import { describe, expect, it } from "vitest";
import { providerCreditsExhausted, rateLimitInfo, rateLimitLeft } from "./apiError";

/** The body OpenRouter actually returned on the reported turn (02/08/2026 journal). */
const OPENROUTER_DAILY = JSON.stringify({
  error: {
    message:
      "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day",
    code: 429,
    metadata: {
      headers: {
        "X-RateLimit-Limit": "50",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1785715200000",
      },
      limit_source: "openrouter_free_tier_daily",
    },
  },
});

describe("rateLimitInfo — une rafale n'est pas un quota épuisé", () => {
  it("lit le quota JOURNALIER signalé, sa limite et sa réinitialisation", () => {
    const rl = rateLimitInfo(OPENROUTER_DAILY);
    expect(rl.daily).toBe(true);
    expect(rl.limit).toBe(50);
    expect(rl.resetAt).toBe(1785715200000);
  });

  it("un 429 de RAFALE reste retryable — c'est le cas que le backoff sert", () => {
    const burst = JSON.stringify({ error: { message: "Too many requests", code: 429 } });
    expect(rateLimitInfo(burst).daily).toBe(false);
  });

  it("compteur à zéro + réinitialisation lointaine ⇒ périodique, même sans le dire", () => {
    // Not every provider names its limit source; a spent counter whose reset is
    // hours away is not caught up by a backoff.
    const far = Date.now() + 6 * 3600_000;
    const body = `{"headers":{"X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${far}"}}`;
    expect(rateLimitInfo(body).daily).toBe(true);
  });

  it("…mais pas si la remise à zéro est imminente (là, patienter marche)", () => {
    const soon = Date.now() + 20_000;
    const body = `{"headers":{"X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${soon}"}}`;
    expect(rateLimitInfo(body).daily).toBe(false);
  });

  it("accepte une réinitialisation en SECONDES comme en millisecondes", () => {
    const secs = Math.floor((Date.now() + 6 * 3600_000) / 1000);
    const rl = rateLimitInfo(`{"headers":{"X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${secs}"}}`);
    expect(rl.resetAt).toBe(secs * 1000);
    expect(rl.daily).toBe(true);
  });

  it("ne prétend rien quand le corps ne dit rien", () => {
    expect(rateLimitInfo("")).toEqual({ daily: false });
    expect(rateLimitInfo("boom")).toEqual({ daily: false });
  });
});

describe("rateLimitLeft — le compteur des réponses RÉUSSIES", () => {
  const h = (m: Record<string, string>) => new Headers(m);

  it("lit ce qu'il reste, le plafond et la reprise", () => {
    const left = rateLimitLeft(
      h({ "x-ratelimit-remaining": "7", "x-ratelimit-limit": "50", "x-ratelimit-reset": "1785715200000" }),
    );
    expect(left).toEqual({ remaining: 7, limit: 50, resetAt: 1785715200000 });
  });

  it("zéro est une valeur, pas une absence", () => {
    expect(rateLimitLeft(h({ "x-ratelimit-remaining": "0" }))).toEqual({ remaining: 0 });
  });

  it("des en-têtes absents ne doivent JAMAIS couler un tour qui a réussi", () => {
    // Many endpoints announce no quota at all; reading a counter is incidental.
    expect(rateLimitLeft(undefined)).toBeUndefined();
    expect(rateLimitLeft(h({}))).toBeUndefined();
    expect(rateLimitLeft(h({ "x-ratelimit-remaining": "beaucoup" }))).toBeUndefined();
  });
});

describe("providerCreditsExhausted — un compte fournisseur à sec n'est pas une limite de débit", () => {
  /** The REAL bodies from the two big ones, as they arrive in the error message. */
  const OPENAI_429 = JSON.stringify({
    error: {
      message:
        "You exceeded your current quota, please check your plan and billing details. " +
        "For more information on this error, read the docs.",
      type: "insufficient_quota",
      code: "insufficient_quota",
    },
  });
  const ANTHROPIC_400 = JSON.stringify({
    type: "error",
    error: {
      type: "invalid_request_error",
      message:
        "Your credit balance is too low to access the Anthropic API. " +
        "Please go to Plans & Billing to upgrade or purchase credits.",
    },
  });

  it("reconnaît l'insufficient_quota d'OpenAI (un 429 qui n'est pas une rafale)", () => {
    expect(providerCreditsExhausted(OPENAI_429)).toBe(true);
    // …and that rateLimitInfo itself sees NOTHING periodic in it: this is exactly the
    // hole that used to answer "wait a few seconds" to a zero balance.
    expect(rateLimitInfo(OPENAI_429).daily).toBe(false);
  });

  it("reconnaît le « credit balance is too low » d'Anthropic (un 400, même pas un 429)", () => {
    expect(providerCreditsExhausted(ANTHROPIC_400)).toBe(true);
  });

  it("reconnaît le « no credits remaining » d'OpenRouter — observé en prod le 06/08", () => {
    // The real body that went through 7 backoff attempts before being called a
    // "momentary rate limit": an account at zero, which only a payment unlocks.
    expect(
      providerCreditsExhausted(
        '{"error":{"message":"You have no credits remaining. Add credits to continue using the API.","code":429}}',
      ),
    ).toBe(true);
  });

  it("ne confond ni une rafale, ni un quota journalier, ni un corps vide", () => {
    expect(providerCreditsExhausted('{"error":{"message":"Too many requests"}}')).toBe(false);
    expect(providerCreditsExhausted('{"error":{"message":"Rate limit exceeded: free-models-per-day"}}')).toBe(false);
    expect(providerCreditsExhausted("")).toBe(false);
  });
});

describe("rateLimitInfo — gratuit et attente ne sont dits que quand le corps les dit", () => {
  it("`free` seulement sur un limit_source de palier gratuit", () => {
    expect(rateLimitInfo('{"metadata":{"limit_source":"openrouter_free_tier_daily"}}').free).toBe(true);
    expect(rateLimitInfo('{"error":"Rate limit exceeded: free-models-per-day"}').free).toBe(true);
    // A DAILY quota on a paying key is periodic but NOT free — this is the case
    // that used to display "Free quota" to someone who pays.
    expect(rateLimitInfo('{"error":"Daily request quota exceeded for this project"}').free).toBeUndefined();
    // A "free" that just passes through a sentence doesn't make a free tier.
    expect(rateLimitInfo('{"error":"feel free to retry"}').free).toBeUndefined();
  });

  it("`retryAfterMs` lu du corps de la passerelle (RATE_LIMITED)", () => {
    expect(rateLimitInfo('{"error":"RATE_LIMITED","retryAfterMs":60000}').retryAfterMs).toBe(60000);
    expect(rateLimitInfo('{"error":"RATE_LIMITED"}').retryAfterMs).toBeUndefined();
  });
});
