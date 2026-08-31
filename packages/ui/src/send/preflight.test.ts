import { afterEach, describe, it, expect } from "vitest";
import { configurePlatformAccess } from "./platformAccess";
import { preflightError, type PreflightInput } from "./preflight";
import type { OrgProfileInfo } from "../host";

// A baseline input that PASSES the gate (BYO provider with a configured key), which
// each test perturbs to exercise one failure branch.
function base(over: Partial<PreflightInput> = {}): PreflightInput {
  return {
    orgProfile: null,
    personalCredits: null,
    personalSub: null,
    keyConfigured: new Set(["anthropic"]),
    hasBilling: true,
    provider: "anthropic",
    model: { id: "claude-x", label: "Claude X" },
    effectivePlatform: false,
    openaiCompatBaseUrl: "http://localhost:11434/v1",
    ...over,
  };
}

const org = (o: Partial<OrgProfileInfo>): OrgProfileInfo =>
  ({ status: "active", allowedModelIds: ["claude-x", "gpt-5.5"], allowedMcpIds: [], byoKeysAllowed: false, ...o }) as OrgProfileInfo;

describe("preflightError", () => {
  afterEach(() => configurePlatformAccess({ served: true }));

  it("passes a BYO send with a configured key (null)", () => {
    expect(preflightError(base())).toBeNull();
  });

  it("blocks a suspended org member", () => {
    const r = preflightError(base({ orgProfile: org({ status: "suspended" }) }));
    expect(r?.text).toMatch(/suspendu/i);
    expect(r?.action).toBeUndefined();
  });

  it("blocks a model the org's allow-list does not carry", () => {
    const r = preflightError(base({ orgProfile: org({ allowedModelIds: ["autre-modele"] }) }));
    expect(r?.text).toBeTruthy();
  });

  it("blocks EVERY model when the org has opened none — an empty allow-list is a policy", () => {
    // La régression que la bascule règle 7 doit tenir : sous liste de refus, « rien de
    // listé » voulait dire « tout est permis ». C'est l'inverse maintenant.
    const r = preflightError(base({ orgProfile: org({ allowedModelIds: [] }) }));
    expect(r?.text).toBeTruthy();
  });

  it("leaves a SOLO account (no org profile) completely unconstrained", () => {
    expect(preflightError(base({ orgProfile: undefined }))).toBeNull();
  });

  // NOTE: the missing-key branch is currently DORMANT — `isPlatformProvider` is true
  // for every hosted provider (only `openai-compat` is non-platform, and that's excluded
  // by the branch's first clause), so a hosted provider never *requires* a key (it
  // routes through the gateway). Preserved verbatim from the original for the day a
  // non-platform, non-openai-compat provider exists; not triggerable with real values.

  it("offers credit options to a FREE individual whose platform credits are exhausted", () => {
    const r = preflightError(
      base({
        provider: "openai",
        effectivePlatform: true,
        personalCredits: { blocked: true } as PreflightInput["personalCredits"],
        personalSub: { tier: "free" } as PreflightInput["personalSub"],
      }),
    );
    expect(r?.action?.kind).toBe("credit_options");
  });

  it("offers credit options to a FREE individual on a platform model with NO plan (no key, no credit yet)", () => {
    // The fix: a free, keyless account is blocked on a paid platform model even before a
    // single credit is spent (FREE has no platform budget) — and gets the subscribe / own-key CTA.
    const r = preflightError(
      base({
        provider: "openai",
        effectivePlatform: true,
        model: { id: "gpt-5.5", label: "GPT-5.5" },
        personalCredits: null,
        personalSub: { tier: "free" } as PreflightInput["personalSub"],
      }),
    );
    expect(r?.action?.kind).toBe("credit_options");
  });

  it("shows a neutral message to a PAYING individual out of credits (no CTA)", () => {
    const r = preflightError(
      base({
        provider: "openai",
        effectivePlatform: true,
        personalCredits: { blocked: true } as PreflightInput["personalCredits"],
        personalSub: { tier: "pro" } as PreflightInput["personalSub"],
      }),
    );
    expect(r?.text).toMatch(/indisponible/i);
    expect(r?.action).toBeUndefined();
  });

  it("un membre d'ORG à budget épuisé garde son geste : le bouton « votre clé » (journal 02/08)", () => {
    // Le budget est géré par l'admin (pas d'upsell), mais « utilisez votre propre
    // clé » était un texte mort sans bouton — la carte n'offrait aucune issue.
    const r = preflightError(
      base({
        provider: "openrouter",
        effectivePlatform: true,
        orgProfile: org({ credits: { blocked: true } } as Partial<OrgProfileInfo>),
      }),
    );
    expect(r?.text).toMatch(/^Crédits épuisés/);
    expect(r?.action).toEqual({ kind: "missing_key", provider: "openrouter", label: expect.any(String) });
  });

  it("un compte SANS facturation à crédits bloqués reçoit aussi le CTA clé", () => {
    const input = base({
      provider: "openrouter",
      effectivePlatform: true,
      hasBilling: false,
      personalCredits: { blocked: true } as PreflightInput["personalCredits"],
    });
    // Par défaut rien ne se vend : ni « crédits » ni « abonnement », la clé reste l'issue.
    const dflt = preflightError(input);
    expect(dflt?.text).toMatch(/^Ce modèle n'est pas disponible/);
    expect(dflt?.text).not.toMatch(/abonnement|crédits/i);
    expect(dflt?.action?.kind).toBe("missing_key");
    // Dans un build qui VEND, la formulation « crédits » est de retour.
    configurePlatformAccess({ served: true, sold: true });
    const r = preflightError(input);
    expect(r?.text).toMatch(/^Crédits épuisés/);
    expect(r?.action?.kind).toBe("missing_key");
    configurePlatformAccess({ served: true });
  });
});
