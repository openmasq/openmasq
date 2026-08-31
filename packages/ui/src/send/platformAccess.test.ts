import { getMessages } from "@openmasq/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { configurePlatformAccess, includedWith, subscriptionsSold } from "./platformAccess";
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

/* Les pastilles se testent sur le catalogue français ; ce qu'on épingle — quel mot est
   INTERDIT selon les drapeaux de build — vaut pour toute langue. */
const fr = getMessages("fr");

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
    expect(unavailableLabel("no_key", "OpenRouter", fr).title).not.toMatch(/abonnement/i);

    // Et avec le service ET la vente, la seconde issue existe : elle se dit (rien n'a
    // changé pour le build hébergé qui vend).
    configurePlatformAccess({ served: true, sold: true });
    expect(unavailableLabel("no_key", "OpenRouter", fr).title).toMatch(/abonnement/i);
  });
});

describe("un build qui SERT sans VENDRE (le défaut du paquet)", () => {
  it("ne vend rien tant que le build ne le dit pas", () => {
    configurePlatformAccess({ served: true });
    expect(subscriptionsSold()).toBe(false);
    configurePlatformAccess({ served: true, sold: true });
    expect(subscriptionsSold()).toBe(true);
  });

  it("nomme la voie incluse par le compte, jamais par un abonnement", () => {
    configurePlatformAccess({ served: true });
    expect(includedWith("Om", fr)).toBe("avec votre compte Om");
    expect(unavailableLabel("no_key", "OpenRouter", fr).title).toMatch(/avec votre compte/);
    expect(unavailableLabel("no_key", "OpenRouter", fr).title).not.toMatch(/abonnement/i);
    // Le modèle « inclus » reste inclus : la pastille ne le vend pas, elle le nomme.
    for (const reason of ["no_credits", "free_mode_only"] as const) {
      const { chip, title } = unavailableLabel(reason, "OpenRouter", fr);
      expect(chip).not.toMatch(/abonnement/i);
      expect(title).not.toMatch(/abonnement|crédits/i);
    }
    configurePlatformAccess({ served: true, sold: true });
    expect(includedWith("Om", fr)).toBe("dans l'abonnement Om");
    expect(unavailableLabel("no_credits", "OpenRouter", fr).chip).toBe("Abonnement requis");
  });
});
