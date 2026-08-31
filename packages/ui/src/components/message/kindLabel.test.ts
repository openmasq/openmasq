import { describe, it, expect } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { kindLabel } from "./kindLabel";

const fr = getMessages("fr");
const NEUTRAL_KIND_LABEL = fr.redactionCatalog.neutralKind;

describe("kindLabel — the copy never shows an engine key", () => {
  it("resolves a coarse category to its French label", () => {
    expect(kindLabel("company", fr)).toBe("Entreprise");
    expect(kindLabel("address", fr)).toBe("Adresse postale");
  });

  it("resolves a FINE kind through its coarse category", () => {
    // The mark carries whatever the detector named; `redactionCategory` folds it.
    expect(kindLabel("COMPANY", fr)).toBe("Entreprise");
  });

  it("keeps « Clés & secrets » when the kind really says so", () => {
    expect(kindLabel("secret", fr)).toBe("Clés & secrets");
    // `api_token` folds to the FINER `apikey` category — its own, more precise label.
    expect(kindLabel("api_token", fr)).toBe("Chaînes type clé (générique)");
  });

  it("does NOT present an unknown kind as a secret (redactionCategory's default)", () => {
    expect(kindLabel("not_a_kind", fr)).toBe(NEUTRAL_KIND_LABEL);
  });

  it("falls back to a neutral word, never to the raw key", () => {
    for (const junk of ["", "   ", undefined, null, "not_a_kind"]) {
      const out = kindLabel(junk as string, fr);
      expect(out).toBe(NEUTRAL_KIND_LABEL);
      expect(out).not.toMatch(/_/); // an engine key would carry one
    }
  });
});
