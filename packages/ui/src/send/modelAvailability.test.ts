import { describe, it, expect } from "vitest";
import type { ProviderId } from "@openmasq/llm";
import {
  modelUnavailableReason,
  pickerBlocks,
  pickerHides,
  unavailableLabel,
  visibleModels,
  type UnavailableReason,
} from "./modelAvailability";
import { preflightError } from "./preflight";
import { resolveEffectivePlatform } from "./routing";
import type { BillingSubscription, CreditBalance, OrgProfileInfo } from "../host";

const BASE = {
  orgProfile: null as OrgProfileInfo | null,
  personalCredits: null as CreditBalance | null,
  keyConfigured: new Set<string>() as ReadonlySet<string>,
  openaiCompatBaseUrl: "http://localhost:11434/v1",
  localEndpointReachable: null as boolean | null,
};
const blocked = { blocked: true } as unknown as CreditBalance;
const ok = { blocked: false } as unknown as CreditBalance;
const freeSub = { tier: "free", status: "free" } as unknown as BillingSubscription;
const paidSub = { tier: "solo", status: "active" } as unknown as BillingSubscription;
// A PAID platform model (priced) vs a free one — the credit gate only bites the paid.
// OpenRouter est le SEUL fournisseur double (clé perso OU abonnement) : c'est donc lui
// qui exerce les deux branches. Un id des cinq grands (`gpt-5.5`) n'est plus servi par
// la plateforme du tout — il n'a qu'une issue, la clé personnelle.
const PAID = { id: "x-ai/grok-4.20", provider: "openrouter" as ProviderId };
const FREE = { id: "poolside/laguna-s-2.1:free", provider: "openrouter" as ProviderId };
const LOCAL = { id: "llama3.3", provider: "openai-compat" as ProviderId };

describe("modelUnavailableReason", () => {
  it("is available when the platform budget is fine", () => {
    expect(
      modelUnavailableReason({ ...BASE, model: PAID, effectivePlatform: true, personalCredits: ok }),
    ).toBeNull();
  });

  it("blocks a PAID platform model when the personal budget is exhausted", () => {
    expect(
      modelUnavailableReason({
        ...BASE,
        model: PAID,
        effectivePlatform: true,
        personalCredits: blocked,
      }),
    ).toBe("no_credits");
  });

  it("never blocks a FREE model, even with no credits", () => {
    expect(
      modelUnavailableReason({
        ...BASE,
        model: FREE,
        effectivePlatform: true,
        personalCredits: blocked,
      }),
    ).toBeNull();
  });

  it("blocks a paid model when the ORG budget is exhausted", () => {
    const orgProfile = { credits: { blocked: true } } as unknown as OrgProfileInfo;
    expect(
      modelUnavailableReason({ ...BASE, model: PAID, effectivePlatform: true, orgProfile }),
    ).toBe("no_credits");
  });

  it("does NOT block on an UNKNOWN budget (still loading) — same as the send gate", () => {
    expect(
      modelUnavailableReason({
        ...BASE,
        model: PAID,
        effectivePlatform: true,
        personalCredits: null,
      }),
    ).toBeNull();
  });

  it("blocks a PAID platform model for a KNOWN free-tier account (no plan, no key)", () => {
    // FREE tier has ZERO platform budget → subscription-only. The row stays SELECTABLE
    // (`pickerBlocks` is false for no_credits) but carries the chip, and the send gate
    // blocks with the subscribe-or-key container instead of a bare 402.
    expect(
      modelUnavailableReason({ ...BASE, model: PAID, effectivePlatform: true, personalSub: freeSub }),
    ).toBe("no_credits");
  });

  /**
   * L'OFFRE GRATUITE (18/08) : sans abonnement ni clé, la plateforme sert DEUX modèles
   * nommés. Ce n'est plus le prix qui ouvre — un `:free` d'OpenRouter ne coûte rien au
   * jeton mais consomme le quota de NOTRE clé, partagé par tous les comptes.
   */
  describe("offre gratuite — la liste, pas le prix", () => {
    const OTHER_FREE = { id: "google/gemma-4-31b-it:free", provider: "openrouter" as ProviderId };
    const NEMOTRON = { id: "nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openrouter" as ProviderId };

    it("sert Laguna et Nemotron 3 Ultra à un compte sans rien", () => {
      for (const model of [FREE, NEMOTRON]) {
        expect(
          modelUnavailableReason({ ...BASE, model, effectivePlatform: true, personalSub: freeSub }),
        ).toBeNull();
      }
    });

    it("refuse un AUTRE `:free` — et le dit autrement que « crédits épuisés »", () => {
      const reason = modelUnavailableReason({
        ...BASE,
        model: OTHER_FREE,
        effectivePlatform: true,
        personalSub: freeSub,
      });
      // La raison est PROPRE au cas : le compte n'a jamais eu de crédits, et le modèle
      // s'affiche « gratuit » — « crédits épuisés » serait faux deux fois.
      expect(reason).toBe("free_mode_only");
      expect(pickerHides(reason!)).toBe(true);
      expect(unavailableLabel(reason!, "OpenRouter").title).toContain("Laguna et Nemotron");
    });

    it("ne touche PAS un compte qui paie : les autres `:free` restent servis", () => {
      expect(
        modelUnavailableReason({
          ...BASE,
          model: OTHER_FREE,
          effectivePlatform: true,
          personalSub: paidSub,
          personalCredits: ok,
        }),
      ).toBeNull();
    });

    it("ne touche PAS le chemin CLÉ PERSO : hors plateforme, la liste ne s'applique pas", () => {
      expect(
        modelUnavailableReason({
          ...BASE,
          model: OTHER_FREE,
          effectivePlatform: false,
          personalSub: freeSub,
          keyConfigured: new Set(["openrouter"]),
        }),
      ).toBeNull();
    });
  });

  it("keeps a PAID platform model available for a PAYING account with budget", () => {
    expect(
      modelUnavailableReason({
        ...BASE,
        model: PAID,
        effectivePlatform: true,
        personalSub: paidSub,
        personalCredits: ok,
      }),
    ).toBeNull();
  });

  it("a free-tier account can still use a FREE model", () => {
    expect(
      modelUnavailableReason({ ...BASE, model: FREE, effectivePlatform: true, personalSub: freeSub }),
    ).toBeNull();
  });

  it("an UNKNOWN subscription (null) does NOT grey — no load flicker for a paying user", () => {
    expect(
      modelUnavailableReason({
        ...BASE,
        model: PAID,
        effectivePlatform: true,
        personalSub: null,
        personalCredits: ok,
      }),
    ).toBeNull();
  });

  // The nuance that makes "no key" NOT mean "unavailable": a platform-ELIGIBLE
  // provider with no key routes through the gateway on credits instead.
  it("keeps a keyless platform-eligible model available when credits are fine", () => {
    const effectivePlatform = resolveEffectivePlatform("openrouter", PAID.id, undefined, new Set());
    expect(effectivePlatform).toBe(true);
    expect(
      modelUnavailableReason({ ...BASE, model: PAID, effectivePlatform, personalCredits: ok }),
    ).toBeNull();
  });

  // The counterpart: a DYNAMIC OpenRouter slug is not gateway-servable (the gateway
  // 400s MODEL_NOT_ALLOWED), so keyless it greys as no_key — its ONLY unlock is the
  // provider's own key, credits can't help.
  it("greys a keyless DYNAMIC OpenRouter slug as no_key even with credits", () => {
    const model = { id: "anthropic/claude-3-haiku", provider: "openrouter" as ProviderId };
    const effectivePlatform = resolveEffectivePlatform("openrouter", model.id, undefined, new Set());
    expect(effectivePlatform).toBe(false);
    expect(
      modelUnavailableReason({ ...BASE, model, effectivePlatform, personalCredits: ok }),
    ).toBe("no_key");
  });

  it("keeps a model with the user's OWN key available even with no credits", () => {
    const keyConfigured = new Set(["openrouter"]);
    const effectivePlatform = resolveEffectivePlatform("openrouter", PAID.id, undefined, keyConfigured);
    expect(effectivePlatform).toBe(false); // routes DIRECT with the key — credits irrelevant
    expect(
      modelUnavailableReason({
        ...BASE,
        model: PAID,
        effectivePlatform,
        keyConfigured,
        personalCredits: blocked,
      }),
    ).toBeNull();
  });

  describe("self-hosted endpoint", () => {
    it("is available when an endpoint is configured", () => {
      expect(
        modelUnavailableReason({ ...BASE, model: LOCAL, effectivePlatform: false }),
      ).toBeNull();
    });

    it("blocks when the endpoint is blank or whitespace", () => {
      for (const openaiCompatBaseUrl of ["", "   "]) {
        expect(
          modelUnavailableReason({
            ...BASE,
            model: LOCAL,
            effectivePlatform: false,
            openaiCompatBaseUrl,
          }),
        ).toBe("no_endpoint");
      }
    });

    it("flags an unreachable server when the probe FAILED (endpoint set, no answer)", () => {
      expect(
        modelUnavailableReason({
          ...BASE,
          model: LOCAL,
          effectivePlatform: false,
          localEndpointReachable: false,
        }),
      ).toBe("endpoint_unreachable");
    });

    it("stays available while the probe result is UNKNOWN (null / not yet run)", () => {
      for (const localEndpointReachable of [null, undefined] as const) {
        expect(
          modelUnavailableReason({
            ...BASE,
            model: LOCAL,
            effectivePlatform: false,
            localEndpointReachable,
          }),
        ).toBeNull();
      }
    });

    it("is available when the server ANSWERED the probe", () => {
      expect(
        modelUnavailableReason({
          ...BASE,
          model: LOCAL,
          effectivePlatform: false,
          localEndpointReachable: true,
        }),
      ).toBeNull();
    });

    it("is never gated on credits (it runs on the user's own machine)", () => {
      expect(
        modelUnavailableReason({
          ...BASE,
          model: LOCAL,
          effectivePlatform: false,
          personalCredits: blocked,
        }),
      ).toBeNull();
    });
  });
});

// The whole point of sharing the helper: what the picker greys out is EXACTLY what
// the send gate refuses. If these ever disagree, a user either picks a model that
// then fails, or is denied one that would have worked.
describe("picker greying agrees with the send gate", () => {
  const cases: { name: string; model: typeof PAID; ctx: Partial<typeof BASE> }[] = [
    { name: "paid platform, no credits", model: PAID, ctx: { personalCredits: blocked } },
    { name: "paid platform, credits ok", model: PAID, ctx: { personalCredits: ok } },
    { name: "free model, no credits", model: FREE, ctx: { personalCredits: blocked } },
    { name: "local, endpoint set", model: LOCAL, ctx: {} },
    { name: "local, endpoint blank", model: LOCAL, ctx: { openaiCompatBaseUrl: "" } },
    { name: "local, server unreachable", model: LOCAL, ctx: { localEndpointReachable: false } },
    {
      name: "openrouter dynamic slug, keyless",
      model: { id: "anthropic/claude-3-haiku", provider: "openrouter" as ProviderId },
      ctx: { personalCredits: ok },
    },
  ];
  for (const c of cases) {
    it(`${c.name}: greyed ⇔ refused`, () => {
      const ctx = { ...BASE, ...c.ctx };
      const effectivePlatform = resolveEffectivePlatform(
        c.model.provider,
        c.model.id,
        undefined,
        ctx.keyConfigured,
      );
      const reason = modelUnavailableReason({ ...ctx, model: c.model, effectivePlatform });
      const fail = preflightError({
        ...ctx,
        personalSub: null,
        hasBilling: true,
        provider: c.model.provider,
        model: { id: c.model.id, label: c.model.id },
        effectivePlatform,
      });
      expect(!!fail).toBe(!!reason);
    });
  }
});

describe("pickerBlocks — what disables a row vs what only informs it", () => {
  it("money/key gates stay SELECTABLE — the send's inline container owns the explanation", () => {
    // Product decision: a free account browses and picks the WHOLE catalogue; the
    // block happens at USE, with the subscribe-or-key CTAs (`preflightError`). A
    // greyed row can't carry that conversation.
    expect(pickerBlocks("no_credits")).toBe(false);
    expect(pickerBlocks("no_key")).toBe(false);
  });

  it("a model with literally nothing to call is disabled in the picker too", () => {
    expect(pickerBlocks("no_endpoint")).toBe(true);
    expect(pickerBlocks("endpoint_unreachable")).toBe(true);
  });
});

describe("unavailableLabel", () => {
  it("names the provider whose key would unlock a credit-blocked model", () => {
    const { chip, title } = unavailableLabel("no_credits", "OpenAI");
    expect(chip).toBe("Abonnement requis");
    expect(title).toContain("OpenAI");
  });

  it("points a self-hosted model at the endpoint setting, not a key", () => {
    const { chip, title } = unavailableLabel("no_endpoint", "OpenAI-compatible / Local");
    expect(chip).toBe("Adresse manquante");
    expect(title).toContain("Modèle sur votre ordinateur");
    expect(title).not.toContain("clé");
  });

  it("says the local server is unreachable, pointing at starting it", () => {
    const { chip, title } = unavailableLabel("endpoint_unreachable", "OpenAI-compatible / Local");
    expect(chip).toBe("Serveur injoignable");
    expect(title).toMatch(/démarré/i);
  });
});

/* Le sélecteur ne LISTE que ce que ce compte peut envoyer (décision produit du 02/08 :
   les cinq grands fournisseurs sont passés en clé personnelle, laisser tout le
   catalogue grisé transformait la liste en vitrine de l'inaccessible). Trois bords
   gardent la liste honnête ET non vide. */
describe("visibleModels — ce que le sélecteur a le droit de lister", () => {
  const M = (id: string) => ({ id });
  const all = [M("libre"), M("sans-cle"), M("sans-credits"), M("local-eteint")];
  const reasons = new Map<string, UnavailableReason>([
    ["sans-cle", "no_key"],
    ["sans-credits", "no_credits"],
    ["local-eteint", "endpoint_unreachable"],
  ]);

  it("masque clé/crédits manquants, GARDE l'utilisable et le local (grisé, pas caché)", () => {
    expect(visibleModels(all, reasons).map((m) => m.id)).toEqual(["libre", "local-eteint"]);
    expect(pickerHides("no_key")).toBe(true);
    expect(pickerHides("no_credits")).toBe(true);
    // Un local injoignable se répare sur SA machine : le cacher cacherait ce qu'il a réglé.
    expect(pickerHides("endpoint_unreachable")).toBe(false);
    expect(pickerHides("no_endpoint")).toBe(false);
  });

  it("garde TOUJOURS la sélection courante, même devenue inutilisable", () => {
    expect(visibleModels(all, reasons, "sans-cle").map((m) => m.id)).toContain("sans-cle");
  });

  it("carte ABSENTE (billing pas encore chargé) ⇒ ne masque rien — jamais de liste vide", () => {
    expect(visibleModels(all, undefined)).toHaveLength(all.length);
  });
});
