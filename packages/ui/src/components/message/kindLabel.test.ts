import { describe, it, expect } from "vitest";
import { kindLabelFr, NEUTRAL_KIND_LABEL } from "./kindLabel";

describe("kindLabelFr — the copy never shows an engine key", () => {
  it("resolves a coarse category to its French label", () => {
    expect(kindLabelFr("company")).toBe("Entreprise");
    expect(kindLabelFr("address")).toBe("Adresse postale");
  });

  it("resolves a FINE kind through its coarse category", () => {
    // The mark carries whatever the detector named; `redactionCategory` folds it.
    expect(kindLabelFr("COMPANY")).toBe("Entreprise");
  });

  it("keeps « Clés & secrets » when the kind really says so", () => {
    expect(kindLabelFr("secret")).toBe("Clés & secrets");
    // `api_token` folds to the FINER `apikey` category — its own, more precise label.
    expect(kindLabelFr("api_token")).toBe("Chaînes type clé (générique)");
  });

  it("does NOT present an unknown kind as a secret (redactionCategory's default)", () => {
    expect(kindLabelFr("not_a_kind")).toBe(NEUTRAL_KIND_LABEL);
  });

  it("falls back to a neutral word, never to the raw key", () => {
    for (const junk of ["", "   ", undefined, null, "not_a_kind"]) {
      const out = kindLabelFr(junk as string);
      expect(out).toBe(NEUTRAL_KIND_LABEL);
      expect(out).not.toMatch(/_/); // an engine key would carry one
    }
  });
});
