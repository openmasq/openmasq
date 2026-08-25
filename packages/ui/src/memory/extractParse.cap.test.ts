import { describe, it, expect } from "vitest";
import { extractionPrompt, factLimitFor, parseExtraction, MAX_EXPLICIT_FACTS } from "./extractParse";

describe("le plafond dépend du MODE — une demande explicite n'est pas du bruit", () => {
  it("annonce le même plafond qu'il applique", () => {
    expect(factLimitFor(false)).toBe(6);
    expect(factLimitFor(true)).toBe(MAX_EXPLICIT_FACTS);
    expect(extractionPrompt("texte", { explicit: true }).system).toContain(
      `Maximum ${MAX_EXPLICIT_FACTS} faits`,
    );
    expect(extractionPrompt("texte").system).toContain("Maximum 6 faits");
  });

  it("coupe à 6 en ambiant, garde la liste complète sur demande explicite", () => {
    const reply = JSON.stringify({
      profil: null,
      faits: Array.from({ length: 12 }, (_, i) => ({
        entite: `E${i}`,
        cat: "organisation",
        fait: `f${i}`,
      })),
    });
    expect(parseExtraction(reply)!.facts).toHaveLength(6);
    expect(parseExtraction(reply, factLimitFor(true))!.facts).toHaveLength(12);
  });

  it("porte la liste des entités déjà connues, pour ne pas dépenser le quota en doublons", () => {
    const sys = extractionPrompt("t", { explicit: true, exclude: ["Apple", "Walmart"] }).system;
    expect(sys).toContain("DÉJÀ EN MÉMOIRE");
    expect(sys).toContain("Apple, Walmart");
    // Sans exclusion, pas de clause parasite.
    expect(extractionPrompt("t", { explicit: true }).system).not.toContain("DÉJÀ EN MÉMOIRE");
  });
});
