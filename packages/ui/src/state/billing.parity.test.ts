import { describe, expect, it } from "vitest";
import { CREDITS_CENTS_PER_SEAT, creditsCentsForAccountType } from "@openmasq/credits";
import { PLAN_TIERS } from "./billing";

/**
 * PARITÉ règle 9 : `PLAN_TIERS.creditsCents` (l'affichage des cartes d'abonnement)
 * doit être EXACTEMENT l'allotement que `@openmasq/credits` fait appliquer par le
 * backend et la gateway. Le runtime de `ui` ne dépend pas de `credits` (le montant
 * affiché vient du catalogue backend quand il est joignable) — ce test est donc le
 * lien : la dette « billing.ts re-déclare les tiers » citée par `state/CLAUDE.md`
 * devient un drift IMPOSSIBLE au lieu d'un rappel en commentaire.
 */
describe("billing.ts ⇄ @openmasq/credits — l'allotement affiché est celui appliqué", () => {
  it("chaque tier affiche le creditsCents que credits fait appliquer", () => {
    for (const t of PLAN_TIERS) {
      expect(t.creditsCents, t.tier).toBe(creditsCentsForAccountType(t.tier.toUpperCase()));
    }
  });

  // Les types qui gardent une enveloppe SANS être vendus. Ils ne sont pas une
  // exception de confort : `CREDITS_CENTS_PER_SEAT` doit continuer de les servir (un
  // abonnement pris avant le retrait se renouvelle et doit être crédité), mais leur
  // offrir une carte remettrait en vente un palier retiré. Voir `RETIRED_TIERS`
  // (apps/backend/.../subscriptions/tiers.ts).
  const NOT_SOLD = new Set(["PRO", "SCALE"]);

  it("aucun tier VENDU n'est absent des cartes", () => {
    const shown = new Set(PLAN_TIERS.map((t) => t.tier.toUpperCase()));
    for (const type of Object.keys(CREDITS_CENTS_PER_SEAT)) {
      if (NOT_SOLD.has(type)) continue;
      expect(shown.has(type), type).toBe(true);
    }
  });

  it("un tier RETIRÉ garde son enveloppe mais n'a pas de carte", () => {
    const shown = new Set(PLAN_TIERS.map((t) => t.tier.toUpperCase()));
    expect(shown.has("SCALE")).toBe(false);
    // Le retirer de l'allotement créditerait 0 à un siège déjà payé.
    expect(creditsCentsForAccountType("SCALE")).toBeGreaterThan(0);
  });

  it("Solo et Team sont alignés — même enveloppe affichée", () => {
    const solo = PLAN_TIERS.find((t) => t.tier === "solo");
    const team = PLAN_TIERS.find((t) => t.tier === "team");
    expect(solo?.priceCents).toBe(team?.priceCents);
    expect(solo?.creditsCents).toBe(team?.creditsCents);
  });
});
