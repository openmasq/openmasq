import { describe, it, expect } from "vitest";
import { WEBNAV_OFFER_KEYS, webNavOfferableCategories, webNavRevealSet } from "./webNavReveal";
import { categoriesForLevel } from "../../privacy/privacyLevel";
import type { Conversation, RedactCategoryKey, Settings } from "../../types";

const conv = (redactCategories?: Conversation["redactCategories"]) =>
  ({ id: "c1", redactCategories }) as Conversation;

const settings = (redactCategories: Record<string, boolean>) =>
  ({ redactCategories }) as unknown as Settings;

describe("webNavOfferableCategories", () => {
  it("offers only the still-REDACTED members of the offer set", () => {
    const s = settings({ name: true, location: true, company: false, email: true });
    // `company` is off (nothing to reveal); `email` is on but is not an offer key.
    expect(webNavOfferableCategories(conv(), s, [])).toEqual(["name", "location"]);
  });

  it("applies the per-conversation override over the global setting", () => {
    const s = settings({ name: true, location: true });
    // A prior reveal in THIS conversation ⇒ `name` is no longer offerable.
    expect(webNavOfferableCategories(conv({ name: false } as never), s, [])).toEqual(["location"]);
  });

  it("never offers an org-forced category", () => {
    const s = settings({ name: true, location: true });
    expect(webNavOfferableCategories(conv(), s, ["name"])).toEqual(["location"]);
  });
});

describe("webNavRevealSet", () => {
  const offerable: RedactCategoryKey[] = ["name", "location"];

  it("reveals exactly the picked subset — not all of them", () => {
    expect(webNavRevealSet(["location"], offerable)).toEqual(["location"]);
  });

  it("FAIL-CLOSED: no pick, empty, null or undefined reveals NOTHING", () => {
    expect(webNavRevealSet([], offerable)).toEqual([]);
    expect(webNavRevealSet(null, offerable)).toEqual([]);
    expect(webNavRevealSet(undefined, offerable)).toEqual([]);
  });

  it("the renderer cannot reveal a category that was never offered", () => {
    // The card is UX; a compromised renderer resolving the gate with an org-forced or
    // simply un-offered key must not turn it into a `redactCategories: false` override.
    expect(webNavRevealSet(["name", "email" as RedactCategoryKey], offerable)).toEqual(["name"]);
    expect(webNavRevealSet(["email" as RedactCategoryKey], offerable)).toEqual([]);
    expect(webNavRevealSet(["name"], [])).toEqual([]);
  });

  it("dedupes — a repeated key must not double-push into disabledKinds", () => {
    expect(webNavRevealSet(["name", "name"], offerable)).toEqual(["name"]);
  });
});

/**
 * ⚠️ The card offers a LEVEL (« Standard »), not five categories — which is true only if
 * the set it offers is EXACTLY what « Standard » leaves readable. The two are
 * derived from the same `ai` flag of the same catalogue, so they CANNOT diverge:
 * this test exists so that stays true the day either one changes its source.
 */
describe("l'offre EST le niveau Standard", () => {
  it("offre exactement ce que « Standard » laisse lisible et que « Renforcé » masque", () => {
    const standard = (categoriesForLevel("standard") ?? {}) as Record<string, boolean>;
    const renforce = (categoriesForLevel("renforce") ?? {}) as Record<string, boolean>;
    // The DIFFERENCE between the two levels, not « everything Standard lets through » :
    // `url` and `username` are off at ALL levels (opt-in), so counting them
    // would make the test claim Standard reveals what nobody masks.
    const cedeParStandard = Object.keys(renforce).filter(
      (k) => renforce[k] === true && standard[k] === false,
    );
    expect([...WEBNAV_OFFER_KEYS].sort()).toEqual(cedeParStandard.sort());
  });
});
