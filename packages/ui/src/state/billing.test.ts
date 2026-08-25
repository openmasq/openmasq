import { describe, expect, it } from "vitest";
import { canPitchSubscription, knownTier, billingErrorMessage, tierAction } from "./billing";

describe("tierAction", () => {
  it("un abonné PAYANT change de palier sur place", () => {
    expect(tierAction({ testerMode: false, isPaid: true, isGranted: false, canChangeTier: true })).toBe("change-tier");
  });

  // ⛔ LA RÉGRESSION. Le palier Solo INCLUS donne un palier à tout compte neuf SANS
  // abonnement Stripe derrière. Router sur « palier ≠ gratuit » envoyait donc tout le monde
  // sur `/change-tier`, qui répond 409 NO_SUBSCRIPTION faute d'abonnement à échanger :
  // plus aucun compte ne pouvait acheter, à aucun palier. Un octroi passe par la CAISSE.
  it("un OCTROI passe par la caisse, comme un compte gratuit", () => {
    expect(tierAction({ testerMode: false, isPaid: true, isGranted: true, canChangeTier: true })).toBe("checkout");
    expect(tierAction({ testerMode: false, isPaid: false, canChangeTier: true })).toBe("checkout");
  });

  it("sans hôte qui sache changer sur place, la caisse — elle existe partout", () => {
    expect(tierAction({ testerMode: false, isPaid: true, isGranted: false, canChangeTier: false })).toBe("checkout");
  });

  it("le mode testeur octroie, quel que soit le reste", () => {
    expect(tierAction({ testerMode: true, isPaid: true, isGranted: false, canChangeTier: true })).toBe("self-grant");
    expect(tierAction({ testerMode: true, isPaid: false, canChangeTier: false })).toBe("self-grant");
  });
});

describe("billingErrorMessage — le mode testeur est un ÉTAT, pas une panne", () => {
    // Le serveur ferme la caisse quand l'environnement est en mode testeur : le message
    // doit dire quoi faire à la place. « Réessayez » serait faux — rien ne changera au
    // prochain clic tant que l'interrupteur est allumé.
    it("dit que rien ne s'encaisse ici, et ne promet ni panne ni réessai", () => {
        const m = billingErrorMessage(409, "TESTER_MODE_ENABLED");
        expect(m).toMatch(/sans paiement/i);
        expect(m).not.toMatch(/réessayez/i);
        // Le libellé du bouton ne change PAS en mode testeur : promettre « S'octroyer »
        // enverrait chercher un bouton qui n'existe pas.
        expect(m).not.toMatch(/octroyer/i);
    });
});

describe("knownTier", () => {
  it("reports a tier only when the subscription was actually read", () => {
    expect(knownTier({ tier: "team" })).toBe("team");
    expect(knownTier({})).toBe("free");
  });

  it("never turns an unknown subscription into the free tier", () => {
    // The bug this exists to stop: on a platform with no `host.billing` slot (mobile,
    // before it had one) `sub` is null, and reading that as "free" showed a PAYING
    // account « 0 € · Abonnement actuel » with every action disabled. Unknown is unknown.
    expect(knownTier(null)).toBeNull();
    expect(knownTier(undefined)).toBeNull();
  });
});

describe("billingErrorMessage", () => {
  it("explains the backend codes an action can fail with", () => {
    expect(billingErrorMessage(409, "SUBSCRIPTION_ALREADY_ACTIVE")).toContain("déjà actif");
    expect(billingErrorMessage(400, "NO_STRIPE_CUSTOMER")).toContain("abonnez-vous");
    expect(billingErrorMessage(401)).toContain("Connectez-vous");
    expect(billingErrorMessage(503)).toContain("ne répond pas");
  });

  it("always yields a message, so a dead button can never stay silent", () => {
    expect(billingErrorMessage(418, "SOMETHING_NEW").length).toBeGreaterThan(0);
  });
});

describe("canPitchSubscription", () => {
  it("pitches only to a KNOWN free account", () => {
    expect(canPitchSubscription({ sub: { tier: "free" } })).toBe(true);
  });

  it("never pitches to an account that already pays", () => {
    // The bug this exists to stop: a subscriber opening the « modèles gratuits »
    // explainer was told to take a subscription.
    for (const tier of ["solo", "team", "scale"]) {
      expect(canPitchSubscription({ sub: { tier } }), tier).toBe(false);
    }
  });

  it("does NOT pitch while the subscription is unknown", () => {
    // null = still loading or the fetch failed. Withholding a CTA the user can still
    // reach from Réglages → Paiement beats telling a paying customer to subscribe.
    expect(canPitchSubscription({ sub: null })).toBe(false);
    expect(canPitchSubscription({ sub: undefined })).toBe(false);
  });

  it("never pitches to an org member, whatever their personal tier", () => {
    // Seats are bought by an admin in the web console — the CTA would lead nowhere.
    expect(canPitchSubscription({ sub: { tier: "free" }, inOrg: true })).toBe(false);
  });

  it("treats a sub with no tier as free", () => {
    expect(canPitchSubscription({ sub: {} })).toBe(true);
  });
});
