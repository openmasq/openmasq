import { describe, expect, it } from "vitest";
import { fsErrorText } from "./fsErrorText";

const enoent = (): NodeJS.ErrnoException => {
  const e = new Error("ENOENT: no such file or directory, stat '/x/y.pdf'") as NodeJS.ErrnoException;
  e.code = "ENOENT";
  return e;
};

describe("fsErrorText — un ENOENT côté OUTIL oriente, jamais côté UI", () => {
  // Constat 15/08 : trois get_file_info ENOENT d'affilée sur des chemins RECOMPOSÉS
  // (le modèle ne peut pas mémoriser les chemins, ils lui reviennent redacted) —
  // le brut Node ne lui apprenait rien, la boucle mourait au cap.
  it("surface outil : le brut + la sortie (relister, recopier exactement)", () => {
    const t = fsErrorText(enoent(), "tool");
    expect(t).toContain("ENOENT");
    expect(t).toMatch(/ne recompose JAMAIS/);
    expect(t).toContain("list_directory");
  });

  it("surface UI : l'erreur BRUTE, sans guidage en prose", () => {
    expect(fsErrorText(enoent(), "ui")).toBe("ENOENT: no such file or directory, stat '/x/y.pdf'");
  });

  it("toute autre erreur passe inchangée — le refus du grant garde SON propre guidage", () => {
    const g = new Error("accès refusé (hors des dossiers autorisés) : /Users/x");
    expect(fsErrorText(g, "tool")).toBe(g.message);
    expect(fsErrorText("boom", "tool")).toBe("boom");
  });
});
