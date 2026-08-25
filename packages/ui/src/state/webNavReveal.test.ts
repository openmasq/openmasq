import { describe, it, expect } from "vitest";
import { WEBNAV_OFFER_KEYS, webNavOfferableCategories, webNavRevealSet } from "./webNavReveal";
import { categoriesForLevel } from "../privacy/privacyLevel";
import type { Conversation, RedactCategoryKey, Settings } from "../types";

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
 * ⚠️ La carte propose un NIVEAU (« Standard »), pas cinq types — ce qui n'est vrai que si
 * l'ensemble qu'elle offre est EXACTEMENT celui que « Standard » laisse lisible. Les deux
 * se dérivent du même drapeau `ai` du même catalogue, donc ils ne PEUVENT pas diverger :
 * ce test est là pour que ça reste vrai le jour où l'un des deux changera de source.
 */
describe("l'offre EST le niveau Standard", () => {
  it("offre exactement ce que « Standard » laisse lisible et que « Renforcé » masque", () => {
    const standard = (categoriesForLevel("standard") ?? {}) as Record<string, boolean>;
    const renforce = (categoriesForLevel("renforce") ?? {}) as Record<string, boolean>;
    // La DIFFÉRENCE entre les deux niveaux, pas « tout ce que Standard laisse passer » :
    // `url` et `username` sont éteintes à TOUS les niveaux (opt-in), donc les compter
    // ferait dire au test que Standard révèle ce que personne ne masque.
    const cedeParStandard = Object.keys(renforce).filter(
      (k) => renforce[k] === true && standard[k] === false,
    );
    expect([...WEBNAV_OFFER_KEYS].sort()).toEqual(cedeParStandard.sort());
  });
});
