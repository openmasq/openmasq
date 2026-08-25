import { describe, it, expect } from "vitest";
import { inactiveCategoryLabels } from "./docCategoryNotice";

describe("inactiveCategoryLabels", () => {
  it("shows NOTHING on a fresh install — the shipped defaults are the promised policy", () => {
    // AI categories now default ON (catalog.test.ts pins it), and the noise-tier
    // (url/apikey/username) is off by DESIGN — disclosing those on every document
    // would cry wolf. No deviation ⇒ no banner.
    expect(inactiveCategoryLabels(undefined, undefined, undefined)).toEqual([]);
  });

  it("discloses an identity category the USER turned off", () => {
    // The audited trust gap, now inverted: protection weaker than the shipped policy
    // must be said out loud — in a document, absence is invisible.
    const labels = inactiveCategoryLabels({ name: false, company: false }, undefined, undefined);
    expect(labels).toContain("Noms & prénoms");
    expect(labels).toContain("Entreprise");
    expect(labels[0]).toBe("Noms & prénoms"); // AI categories lead — they matter most in a doc
  });

  it("discloses a deterministic category turned off too (weaker is weaker)", () => {
    expect(inactiveCategoryLabels({ email: false }, undefined, undefined)).toContain("E-mail");
  });

  it("honours the conversation override over the global setting", () => {
    const labels = inactiveCategoryLabels({ name: true }, { name: false }, undefined);
    expect(labels).toContain("Noms & prénoms");
  });

  it("never lists an org-forced category (it cannot be off)", () => {
    const labels = inactiveCategoryLabels({ name: false }, { name: false }, ["name"]);
    expect(labels).not.toContain("Noms & prénoms");
  });

  it("never lists a noise-tier or retired category, even when explicitly off", () => {
    const labels = inactiveCategoryLabels(
      { url: false, username: false, health: false },
      undefined,
      undefined,
    );
    expect(labels).toEqual([]);
  });

  // `apikey` a quitté le palier « bruit » : elle est ON par défaut et fait partie du
  // plancher de tous les niveaux. L'éteindre est donc bien une protection PLUS FAIBLE
  // que ce que le produit promet — c'est exactement ce que ce bandeau existe pour dire.
  it("liste « Chaînes type clé » quand elle est éteinte — c'est un écart au défaut", () => {
    const labels = inactiveCategoryLabels({ apikey: false }, undefined, undefined);
    expect(labels).toEqual(["Chaînes type clé (générique)"]);
  });
});
