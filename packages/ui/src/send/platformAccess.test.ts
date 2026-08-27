import { afterEach, describe, expect, it } from "vitest";
import { configurePlatformAccess } from "./platformAccess";
import { resolveEffectivePlatform } from "./routing";
import { modelUnavailableReason, unavailableLabel } from "./modelAvailability";
import { preflightError } from "./preflight";

// Le modèle par défaut d'une conversation neuve : servi par la plateforme quand elle
// existe, et c'est justement lui qui, sans elle, échouait à l'envoi.
const MODEL = { id: "poolside/laguna-s-2.1:free", provider: "openrouter" as const };
const NO_KEYS: ReadonlySet<string> = new Set();

const reasonFor = (served: boolean) => {
  configurePlatformAccess({ served });
  return modelUnavailableReason({
    model: MODEL,
    effectivePlatform: resolveEffectivePlatform(MODEL.provider, MODEL.id, undefined, NO_KEYS),
    orgProfile: null,
    personalCredits: null,
    personalSub: null,
    keyConfigured: NO_KEYS,
    openaiCompatBaseUrl: "",
  });
};

// Le défaut du paquet, et ce que tout autre test suppose.
afterEach(() => configurePlatformAccess({ served: true }));

describe("un build SANS service hébergé (ni passerelle ni comptes)", () => {
  it("ne route plus rien vers la plateforme — il n'y a ni endpoint ni jeton à obtenir", () => {
    configurePlatformAccess({ served: true });
    expect(resolveEffectivePlatform(MODEL.provider, MODEL.id, undefined, NO_KEYS)).toBe(true);
    configurePlatformAccess({ served: false });
    expect(resolveEffectivePlatform(MODEL.provider, MODEL.id, undefined, NO_KEYS)).toBe(false);
  });

  it("rend le modèle « inclus » à ce qu'il est vraiment ici : un modèle à CLÉ", () => {
    // Avec le service : disponible sans rien (c'est l'offre gratuite). Sans lui : la clé
    // de l'utilisateur est la seule porte — dit AVANT l'envoi, au lieu d'un échec réseau.
    expect(reasonFor(true)).toBeNull();
    expect(reasonFor(false)).toBe("no_key");
  });

  it("ne promet AUCUN abonnement — ni sur la pastille, ni dans le refus d'envoi", () => {
    const gate = () =>
      preflightError({
        orgProfile: null,
        personalCredits: null,
        personalSub: null,
        keyConfigured: NO_KEYS,
        hasBilling: false,
        provider: MODEL.provider,
        model: { id: MODEL.id, label: "Laguna S 2.1" },
        effectivePlatform: resolveEffectivePlatform(MODEL.provider, MODEL.id, undefined, NO_KEYS),
        openaiCompatBaseUrl: "",
      });

    configurePlatformAccess({ served: false });
    const refused = gate();
    expect(refused?.text).toMatch(/Clé manquante/);
    expect(refused?.text).not.toMatch(/abonnement/i);
    expect(unavailableLabel("no_key", "OpenRouter").title).not.toMatch(/abonnement/i);

    // Et avec le service, la seconde issue existe : elle se dit (rien n'a changé pour
    // le build hébergé).
    configurePlatformAccess({ served: true });
    expect(unavailableLabel("no_key", "OpenRouter").title).toMatch(/abonnement/i);
  });
});
