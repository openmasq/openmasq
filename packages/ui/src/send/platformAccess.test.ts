import { getMessages } from "@openmasq/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { configurePlatformAccess, includedWith, subscriptionsSold } from "./platformAccess";
import { resolveEffectivePlatform } from "./routing";
import { modelUnavailableReason, unavailableLabel } from "./modelAvailability";
import { preflightError } from "./preflight";

// The default model for a new conversation: served by the platform when it
// exists, and it is precisely this one that, without it, used to fail to send.
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

// The package's default, and what every other test assumes.
afterEach(() => configurePlatformAccess({ served: true }));

/* The chips are tested against the French catalog; what we pin down — which word is
   FORBIDDEN depending on the build flags — holds for every language. */
const fr = getMessages("fr");

describe("un build SANS service hébergé (ni passerelle ni comptes)", () => {
  it("ne route plus rien vers la plateforme — il n'y a ni endpoint ni jeton à obtenir", () => {
    configurePlatformAccess({ served: true });
    expect(resolveEffectivePlatform(MODEL.provider, MODEL.id, undefined, NO_KEYS)).toBe(true);
    configurePlatformAccess({ served: false });
    expect(resolveEffectivePlatform(MODEL.provider, MODEL.id, undefined, NO_KEYS)).toBe(false);
  });

  it("rend le modèle « inclus » à ce qu'il est vraiment ici : un modèle à CLÉ", () => {
    // With the service: available with nothing (that's the free offer). Without it: the
    // user's key is the only door — said BEFORE the send, instead of a network failure.
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

    // And with the service AND the sale, the second way out exists: it is said (nothing
    // changed for the hosted build that sells).
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
    // The « included » model stays included: the chip doesn't sell it, it names it.
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
