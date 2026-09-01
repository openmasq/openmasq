import { getMessages } from "@openmasq/i18n";
import { afterEach, describe, it, expect } from "vitest";
import { configurePlatformAccess } from "./platformAccess";
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
// OpenRouter is the ONLY dual provider (personal key OR subscription): so it's the one
// that exercises both branches. An id from the big five (`gpt-5.5`) is no longer served
// by the platform at all — it has only one way out, the personal key.
const PAID = { id: "x-ai/grok-4.20", provider: "openrouter" as ProviderId };
const FREE = { id: "poolside/laguna-s-2.1:free", provider: "openrouter" as ProviderId };
const LOCAL = { id: "llama3.3", provider: "openai-compat" as ProviderId };

/* The chips are tested against the French catalog; what we pin down — which word is
   FORBIDDEN depending on the build flags — holds for every language. */
const fr = getMessages("fr");

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
   * THE FREE OFFER (18/08): with no subscription or key, the platform serves TWO named
   * models. It's no longer the price that opens it up — an OpenRouter `:free` costs
   * nothing per token but consumes OUR key's quota, shared across every account.
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
      // The reason is SPECIFIC to the case: the account never had any credits, and the
      // model shows as « gratuit » — « crédits épuisés » would be wrong twice over.
      expect(reason).toBe("free_mode_only");
      expect(pickerHides(reason!)).toBe(true);
      expect(unavailableLabel(reason!, "OpenRouter", fr).title).toContain("Laguna et Nemotron");
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

  describe("abonnement Claude via la CLI (`claude-cli`)", () => {
    const CLI = { id: "claude-cli", provider: "claude-cli" as ProviderId };

    it("n'est utilisable que sur un `claudeCliReady` POSITIF (réglage ON + CLI détectée)", () => {
      expect(
        modelUnavailableReason({ ...BASE, model: CLI, effectivePlatform: false, claudeCliReady: true }),
      ).toBeNull();
    });

    it("fail-closed : inconnu, absent ou faux ⇒ indisponible — jamais fail-open", () => {
      for (const ready of [false, null, undefined]) {
        expect(
          modelUnavailableReason({ ...BASE, model: CLI, effectivePlatform: false, claudeCliReady: ready }),
        ).toBe("cli_unavailable");
      }
    });

    it("codex-cli suit la même règle fail-closed, sur SON drapeau", () => {
      const G = { id: "codex-cli", provider: "codex-cli" as ProviderId };
      expect(
        modelUnavailableReason({ ...BASE, model: G, effectivePlatform: false, codexCliReady: true }),
      ).toBeNull();
      expect(
        modelUnavailableReason({ ...BASE, model: G, effectivePlatform: false, claudeCliReady: true }),
      ).toBe("cli_unavailable"); // the claude flag does NOT open gemini
    });

    it("est MASQUÉ du sélecteur (pas grisé) : la CLI absente est le cas de presque tous", () => {
      expect(pickerHides("cli_unavailable")).toBe(true);
      expect(pickerBlocks("cli_unavailable")).toBe(false);
    });

    it("grisé ⇔ refusé : la garde d'envoi refuse ce que le sélecteur cache", () => {
      const fail = preflightError({
        orgProfile: null,
        personalCredits: null,
        personalSub: null,
        keyConfigured: new Set(),
        hasBilling: false,
        provider: "claude-cli",
        model: { id: "claude-cli", label: "Claude Code" },
        effectivePlatform: false,
        openaiCompatBaseUrl: "",
        claudeCliReady: false,
      });
      expect(fail?.text).toMatch(/Claude Code/);
    });
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
  // By default nothing is sold: the chip says « Indisponible ». « Abonnement requis »
  // exists only in a build that sells (`platformAccess.test.ts` pins the absence).
  afterEach(() => configurePlatformAccess({ served: true }));

  it("names the provider whose key would unlock a credit-blocked model", () => {
    configurePlatformAccess({ served: true, sold: true });
    const { chip, title } = unavailableLabel("no_credits", "OpenAI", fr);
    expect(chip).toBe("Abonnement requis");
    expect(title).toContain("OpenAI");
  });

  it("points a self-hosted model at the endpoint setting, not a key", () => {
    const { chip, title } = unavailableLabel("no_endpoint", "OpenAI-compatible / Local", fr);
    expect(chip).toBe("Adresse manquante");
    expect(title).toContain("Modèle sur votre ordinateur");
    expect(title).not.toContain("clé");
  });

  it("says the local server is unreachable, pointing at starting it", () => {
    const { chip, title } = unavailableLabel("endpoint_unreachable", "OpenAI-compatible / Local", fr);
    expect(chip).toBe("Serveur injoignable");
    expect(title).toMatch(/démarré/i);
  });
});

/* The picker only LISTS what this account can send (product decision from 02/08:
   the big five providers moved to personal-key-only, leaving the whole catalog
   greyed out turned the list into a showcase of the unreachable). Three edge
   cases keep the list honest AND non-empty. */
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
    // An unreachable local model is fixed on ITS OWN machine: hiding it would hide what it just fixed.
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

describe("modelUnavailableReason — le MODE GRATUIT du déploiement", () => {
  // The server serves `tier: "unlimited"` + `unlimited` credits (never blocked): a
  // PAID included model must be offered. Pinned because the guard only reads
  // `tier === "free"` — if one day it read « known catalog tier » instead, this test
  // would say free mode had just hidden every included model.
  const unlimitedSub = { tier: "unlimited", status: "active", freeMode: true } as unknown as BillingSubscription;
  const unlimited = { blocked: false, unlimited: true, allotmentCents: 0, balanceCents: 0 } as unknown as CreditBalance;

  it("un modèle inclus payant est disponible sans clé, sur un palier « unlimited »", () => {
    expect(
      modelUnavailableReason({
        ...BASE,
        model: PAID,
        effectivePlatform: true,
        personalSub: unlimitedSub,
        personalCredits: unlimited,
      }),
    ).toBeNull();
  });

  it("⛔ un solde à 0 ne bloque PAS quand `blocked` est faux — c'est le drapeau qui décide, jamais l'arithmétique", () => {
    // `allotmentCents`/`balanceCents` are 0 in free mode: recomputing `balance ≤ 0`
    // client-side would hide everything. Only `blocked` (server) is authoritative.
    expect(
      modelUnavailableReason({ ...BASE, model: PAID, effectivePlatform: true, personalSub: unlimitedSub, personalCredits: unlimited }),
    ).toBeNull();
    expect(
      modelUnavailableReason({ ...BASE, model: PAID, effectivePlatform: true, personalSub: unlimitedSub, personalCredits: { ...unlimited, blocked: true } as CreditBalance }),
    ).toBe("no_credits");
  });
});
