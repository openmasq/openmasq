import { describe, expect, it } from "vitest";
import { CREDITS_CENTS_PER_SEAT, creditsCentsForAccountType } from "@openmasq/credits";
import { getMessages } from "@openmasq/i18n";
import { planTiers } from "./billing";

const PLAN_TIERS = planTiers(getMessages("fr"));

/**
 * PARITY rule 9: `PLAN_TIERS.creditsCents` (the subscription cards' display)
 * must be EXACTLY the allotment that `@openmasq/credits` has the
 * backend and gateway apply. `ui`'s runtime doesn't depend on `credits` (the displayed
 * amount comes from the backend catalog when it's reachable) — this test is therefore the
 * link: the debt "billing.ts re-declares the tiers" cited by `state/CLAUDE.md`
 * becomes an IMPOSSIBLE drift instead of a comment reminder.
 */
describe("billing.ts ⇄ @openmasq/credits — l'allotement affiché est celui appliqué", () => {
  it("chaque tier affiche le creditsCents que credits fait appliquer", () => {
    for (const t of PLAN_TIERS) {
      expect(t.creditsCents, t.tier).toBe(creditsCentsForAccountType(t.tier.toUpperCase()));
    }
  });

  // The types that keep an allotment WITHOUT being sold. They aren't a
  // convenience exception: `CREDITS_CENTS_PER_SEAT` must keep serving them (a
  // subscription taken before the retirement renews and must be credited), but
  // offering them a card would put a retired tier back on sale. See `RETIRED_TIERS`
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
    // Removing it from the allotment would credit 0 to an already-paid seat.
    expect(creditsCentsForAccountType("SCALE")).toBeGreaterThan(0);
  });

  it("Solo et Team sont alignés — même enveloppe affichée", () => {
    const solo = PLAN_TIERS.find((t) => t.tier === "solo");
    const team = PLAN_TIERS.find((t) => t.tier === "team");
    expect(solo?.priceCents).toBe(team?.priceCents);
    expect(solo?.creditsCents).toBe(team?.creditsCents);
  });
});
