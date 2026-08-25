import { describe, it, expect, beforeEach } from "vitest";
import { attachmentVault, forgetAttachmentVault } from "./attachmentVault";

/**
 * L'invariant que ce module rend possible : DEUX pièces jointes d'une même conversation
 * partagent un coffre, donc une même personne n'y reçoit qu'UN faux. Mesuré cassé le
 * 15/08/2026 sur deux pièces réelles (Kbis + accord de principe) — le modèle en concluait
 * qu'elles désignaient des gens différents.
 */
describe("coffre de travail des pièces jointes", () => {
  beforeEach(() => {
    for (const id of ["c1", "c2", "brouillon"]) forgetAttachmentVault(id);
  });

  it("deux pièces de la MÊME conversation partagent le même objet", () => {
    const a = attachmentVault("c1");
    const b = attachmentVault("c1");
    expect(b).toBe(a); // même référence : ce que la 1re pièce alloue, la 2e le voit
    a["Anselme Sauvestre"] = "Sabourdin Julien";
    expect(attachmentVault("c1")["Anselme Sauvestre"]).toBe("Sabourdin Julien");
  });

  it("deux CONVERSATIONS ne partagent rien", () => {
    attachmentVault("c1")["X"] = "réel-1";
    expect(attachmentVault("c2")["X"]).toBeUndefined();
  });

  it("s'amorce du coffre PERSISTÉ, et une seule fois", () => {
    const v = attachmentVault("c1", { "Faux Ancien": "Réel Ancien" });
    expect(v["Faux Ancien"]).toBe("Réel Ancien");
    v["Faux Neuf"] = "Réel Neuf";
    // Une amorce plus tardive ne doit pas écraser ce que le tour a déjà attribué.
    const again = attachmentVault("c1", { "Faux Ancien": "AUTRE" });
    expect(again["Faux Neuf"]).toBe("Réel Neuf");
    expect(again["Faux Ancien"]).toBe("Réel Ancien");
  });

  it("ne recopie PAS l'amorce : muter le coffre de travail ne touche pas le persisté", () => {
    const persiste = { "Faux A": "Réel A" };
    const travail = attachmentVault("c1", persiste);
    travail["Faux B"] = "Réel B";
    expect(persiste["Faux B" as keyof typeof persiste]).toBeUndefined();
  });

  it("borné : une session longue n'accumule pas indéfiniment", () => {
    const premier = attachmentVault("conv-0");
    premier["marqueur"] = "présent";
    for (let i = 1; i <= 30; i++) attachmentVault(`conv-${i}`);
    // Le plus ancien a été évincé — on en repart proprement, jamais sur le même objet.
    expect(attachmentVault("conv-0")["marqueur"]).toBeUndefined();
  });
});
