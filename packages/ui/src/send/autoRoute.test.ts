import { afterEach, describe, it, expect } from "vitest";
import { configurePlatformAccess } from "./platformAccess";
import { isFreeModel, supportsTools, findModel } from "@openmasq/llm";
import type { BillingSubscription, CreditBalance } from "../host";
import { selectableModels } from "../prompt/models";
import { modelUnavailableReason } from "./modelAvailability";
import { resolveEffectivePlatform } from "./routing";
import {
  AUTO_MODEL_ID,
  classifyAutoTask,
  isAutoModelId,
  resolveAutoModel,
  type AutoRouteAvailability,
  type AutoRouteSignals,
} from "./autoRoute";

const freeSub = { tier: "free", status: "free" } as unknown as BillingSubscription;
const paidSub = { tier: "solo", status: "active" } as unknown as BillingSubscription;
const okCredits = { blocked: false } as unknown as CreditBalance;

/** Account with NOTHING: no key, no subscription — only `:free` models are sendable. */
const FREE_TIER: AutoRouteAvailability = {
  billingMode: undefined,
  keyConfigured: new Set<string>(),
  orgProfile: null,
  personalCredits: null,
  personalSub: freeSub,
  openaiCompatBaseUrl: "",
  localEndpointReachable: null,
};

/** Paying subscriber, no personal key: platform models (metered gateway) open up. */
const SUBSCRIBED: AutoRouteAvailability = { ...FREE_TIER, personalSub: paidSub, personalCredits: okCredits };

const SIGNALS: AutoRouteSignals = {
  text: "Bonjour, peux-tu m'aider ?",
  attachmentChars: 0,
  hasImages: false,
  usesConnectors: false,
};

const CANDIDATES = selectableModels();

describe("classifyAutoTask", () => {
  it("une question courte sans outil est légère", () => {
    expect(classifyAutoTask(SIGNALS)).toBe("leger");
  });
  it("du code forcé est expert, même court", () => {
    expect(classifyAutoTask({ ...SIGNALS, forcesCode: true })).toBe("expert");
  });
  it("agir via des connecteurs est expert ; seulement CONSULTER ne l'est pas", () => {
    expect(classifyAutoTask({ ...SIGNALS, usesConnectors: true })).toBe("expert");
    expect(classifyAutoTask({ ...SIGNALS, usesConnectors: true, consultOnly: true })).toBe("standard");
  });
  it("un gros document est expert", () => {
    expect(classifyAutoTask({ ...SIGNALS, attachmentChars: 50_000 })).toBe("expert");
  });
  it("le lexique AFFINE : un verbe expert classe expert même court, dans les six langues", () => {
    for (const t of [
      "Prouve que cette suite converge.",
      "Help me debugging this crash",
      "Depura este script",
      "Beweise die Ungleichung",
      "Ottimizza questa query",
      "Refatora o módulo",
    ])
      expect(classifyAutoTask({ ...SIGNALS, text: t }), t).toBe("expert");
  });
  it("une transformation de surface reste légère au-delà de 280 caractères (< 2000)", () => {
    const t = `Traduis ce paragraphe en anglais : ${"la réunion de mardi est reportée. ".repeat(20)}`;
    expect(t.length).toBeGreaterThan(280);
    expect(classifyAutoTask({ ...SIGNALS, text: t })).toBe("leger");
    // But HEAVY wins: the same length with an expert verb is not light.
    expect(classifyAutoTask({ ...SIGNALS, text: `optimise puis ${t}` })).toBe("expert");
  });
  it("une consigne multi-étapes est experte", () => {
    expect(
      classifyAutoTask({
        ...SIGNALS,
        text: "D'abord relis le contrat, puis compare les clauses, ensuite rédige la synthèse",
      }),
    ).toBe("expert");
  });
});

describe("resolveAutoModel — le côté sûr", () => {
  it("ne choisit JAMAIS un modèle que la barrière d'envoi refuserait", () => {
    // A PROPERTY, not case by case: across several accounts AND several signals, the
    // pick always passes the SAME gate as preflightError (rule 9).
    const accounts = [FREE_TIER, SUBSCRIBED, { ...FREE_TIER, personalSub: null }];
    const signalSets: AutoRouteSignals[] = [
      SIGNALS,
      { ...SIGNALS, usesConnectors: true },
      { ...SIGNALS, attachmentChars: 30_000 },
      { ...SIGNALS, forcesCode: true },
    ];
    for (const a of accounts)
      for (const s of signalSets) {
        const r = resolveAutoModel(CANDIDATES, s, a);
        expect(r).not.toBeNull();
        const reason = modelUnavailableReason({
          model: r!.model,
          effectivePlatform: resolveEffectivePlatform(r!.model.provider, r!.model.id, a.billingMode, a.keyConfigured),
          orgProfile: a.orgProfile,
          personalCredits: a.personalCredits,
          personalSub: a.personalSub,
          keyConfigured: a.keyConfigured,
          openaiCompatBaseUrl: a.openaiCompatBaseUrl,
          localEndpointReachable: a.localEndpointReachable,
        });
        expect(reason, `${r!.model.id} refusé (${reason})`).toBeNull();
      }
  });

  it("compte gratuit sans clé : reste sur un modèle gratuit, quelle que soit la tâche", () => {
    const light = resolveAutoModel(CANDIDATES, SIGNALS, FREE_TIER)!;
    const expert = resolveAutoModel(CANDIDATES, { ...SIGNALS, attachmentChars: 30_000 }, FREE_TIER)!;
    expect(isFreeModel(light.model.id)).toBe(true);
    expect(light.billing).toBe("free");
    expect(isFreeModel(expert.model.id)).toBe(true);
    expect(expert.billing).toBe("free");
  });

  it("abonné : une tâche experte PEUT escalader vers un modèle métré — et le dit", () => {
    const r = resolveAutoModel(CANDIDATES, { ...SIGNALS, attachmentChars: 30_000 }, SUBSCRIBED)!;
    // The escalation is the intended behaviour (the best reasoning/code profile for
    // this account is a platform model) and `billing` makes it EXPLICIT for the UI.
    expect(r.taskClass).toBe("expert");
    expect(r.billing).toBe("metered");
    expect(isFreeModel(r.model.id)).toBe(false);
  });

  it("abonné : une question triviale ne consomme PAS de crédits", () => {
    const r = resolveAutoModel(CANDIDATES, SIGNALS, SUBSCRIBED)!;
    expect(r.taskClass).toBe("leger");
    expect(r.billing).toBe("free");
  });

  it("des images imposent un modèle vision", () => {
    const r = resolveAutoModel(CANDIDATES, { ...SIGNALS, hasImages: true }, SUBSCRIBED)!;
    expect(r.model.vision).toBe(true);
  });

  /**
   * ⚠️ ACCEPTED CONSEQUENCE of the two-model free offer (18/08): Laguna and
   * Nemotron 3 Ultra are TEXT ONLY. With no subscription or key, no candidate satisfies
   * « images are sent ⇒ vision is mandatory », so Auto picks NOTHING and the caller
   * falls back to the default model — rather than electing a model that won't see
   * the image. The day a `:free` vision model enters `FREE_MODE_MODEL_IDS`, this case
   * falls away on its own, and that is the signal to revisit this decision.
   */
  it("offre gratuite : des images ⇒ AUCUN candidat (les deux modèles sont texte seul)", () => {
    expect(resolveAutoModel(CANDIDATES, { ...SIGNALS, hasImages: true }, FREE_TIER)).toBeNull();
  });

  it("la boucle agentique exclut les modèles sans function calling", () => {
    const r = resolveAutoModel(CANDIDATES, { ...SIGNALS, usesConnectors: true }, FREE_TIER)!;
    expect(supportsTools(r.model.id)).toBe(true);
    expect(findModel(r.model.id)?.noTools).toBeUndefined();
  });

  it("un très gros document exclut les petites fenêtres de contexte", () => {
    // ~400k input tokens: only windows ≥ ~600k remain candidates.
    const r = resolveAutoModel(CANDIDATES, { ...SIGNALS, attachmentChars: 1_600_000 }, FREE_TIER)!;
    expect(r.model.id).toMatch(/nemotron-3-(ultra|super)/);
  });

  it("est déterministe : mêmes entrées, même élu", () => {
    const a = resolveAutoModel(CANDIDATES, { ...SIGNALS, usesConnectors: true }, SUBSCRIBED);
    const b = resolveAutoModel(CANDIDATES, { ...SIGNALS, usesConnectors: true }, SUBSCRIBED);
    expect(a?.model.id).toBe(b?.model.id);
  });

  it("aucun candidat envoyable ⇒ null (fail closed, l'appelant retombe sur le défaut)", () => {
    // A list with no free model at all, for a free account with no key: everything is refused.
    const paidOnly = CANDIDATES.filter((m) => !isFreeModel(m.id));
    expect(resolveAutoModel(paidOnly, SIGNALS, { ...FREE_TIER })).toBeNull();
  });

  it("le sentinel n'est pas un id de modèle réel", () => {
    expect(isAutoModelId(AUTO_MODEL_ID)).toBe(true);
    expect(findModel(AUTO_MODEL_ID)).toBeUndefined();
  });
});

describe("autoRouteCaption — la légende est une promesse d'argent", () => {
  afterEach(() => configurePlatformAccess({ served: true }));

  it("par défaut (rien à vendre), un envoi métré est parti sur le COMPTE — jamais un abonnement", async () => {
    const { autoRouteCaption } = await import("./autoRoute");
    expect(autoRouteCaption("metered", "GLM-5.2")).toContain("inclus avec votre compte");
    expect(autoRouteCaption("metered", "GLM-5.2")).not.toContain("abonnement");
  });

  it("ne dit « via votre abonnement » QUE sur un envoi métré, dans un build qui VEND", async () => {
    configurePlatformAccess({ served: true, sold: true });
    const { autoRouteCaption } = await import("./autoRoute");
    expect(autoRouteCaption("metered", "GLM-5.2")).toContain("via votre abonnement");
    expect(autoRouteCaption("byo", "GPT-5.5")).not.toContain("abonnement");
    expect(autoRouteCaption("free", "Laguna S 2.1")).not.toContain("abonnement");
    expect(autoRouteCaption("free", "Laguna S 2.1")).toContain("gratuit");
  });
});
